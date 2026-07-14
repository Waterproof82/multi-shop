# TPV Audit Trail SIALTI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 6 gaps de cumplimiento SIALTI (Ley 11/2021 + RD 1007/2023) en el módulo de turnos del TPV: inalterabilidad de `tpv_turnos`, hash chaining, tabla de eventos inalterable, `efectivo_cierre_teorico_cents` persistido, y movimientos de caja intermedios.

**Architecture:** Dos migraciones PostgreSQL añaden triggers de bloqueo + hash chaining a `tpv_turnos` y crean la tabla append-only `tpv_turno_eventos`. La capa de aplicación se extiende con un nuevo use-case (`registrarMovimientoCaja`) y el repositorio propaga los eventos desde los métodos `abrirTurno` y `cerrarTurno`. La ruta de cierre recalcula el teórico incluyendo movimientos intermedios.

**Tech Stack:** PostgreSQL + pgcrypto (SHA-256), Supabase RLS, TypeScript, Next.js App Router, Zod, patrón Result<T, AppError>.

---

## File Map

```
MIGRATIONS
  supabase/migrations/20260714000001_tpv_turnos_inalterabilidad.sql   (NEW — GAP-1,3,4)
  supabase/migrations/20260714000002_tpv_turno_eventos.sql            (NEW — GAP-2)

DOMAIN
  src/core/domain/entities/tpv-types.ts                               (MODIFY — GAP-5,6)
  src/core/domain/repositories/ITpvRepository.ts                      (MODIFY — GAP-6)

INFRASTRUCTURE
  src/core/infrastructure/repositories/supabase-tpv.repository.ts     (MODIFY — GAP-5,6)

USE CASES
  src/core/application/use-cases/tpv/cerrar-turno.use-case.ts        (MODIFY — GAP-5)
  src/core/application/use-cases/tpv/registrar-movimiento-caja.use-case.ts (NEW — GAP-6)

API ROUTES
  src/app/api/tpv/turno/[id]/cerrar/route.ts                         (MODIFY — GAP-5,6)
  src/app/api/tpv/turno/[id]/movimiento-caja/route.ts                (NEW — GAP-6)

DOCS
  docs/tpv-legal-compliance.md                                        (MODIFY — registro)
```

---

## Task 1: Migración — Inalterabilidad de `tpv_turnos`

Cubre los gaps 1 (no-DELETE), 3 (hash chaining) y 4 (no-UPDATE post-cierre).
También añade la columna `efectivo_cierre_teorico_cents` (gap 5) aprovechando la misma migración.

**Files:**
- Create: `supabase/migrations/20260714000001_tpv_turnos_inalterabilidad.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- supabase/migrations/20260714000001_tpv_turnos_inalterabilidad.sql

-- pgcrypto ya habilitado en 20260703000001. No hace falta re-crear.

-- ─── Columnas nuevas ─────────────────────────────────────────────────────────
ALTER TABLE public.tpv_turnos
  ADD COLUMN IF NOT EXISTS hash_encadenado               TEXT,
  ADD COLUMN IF NOT EXISTS efectivo_cierre_teorico_cents INTEGER;

-- ─── Hash chaining BEFORE INSERT ─────────────────────────────────────────────
-- El hash encadena: empresa_id | nuevo_id | efectivo_apertura | apertura_at | hash_anterior
-- El primer turno de cada empresa tiene hash_anterior = 'INICIO'.
CREATE OR REPLACE FUNCTION tpv_turno_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash TEXT;
  payload   TEXT;
BEGIN
  SELECT hash_encadenado INTO prev_hash
    FROM public.tpv_turnos
   WHERE empresa_id = NEW.empresa_id
   ORDER BY apertura_at DESC
   LIMIT 1;

  payload :=
    NEW.empresa_id::TEXT                                              || '|' ||
    NEW.id::TEXT                                                      || '|' ||
    NEW.efectivo_apertura_cents::TEXT                                 || '|' ||
    to_char(NEW.apertura_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')          || '|' ||
    COALESCE(prev_hash, 'INICIO');

  NEW.hash_encadenado := encode(digest(payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_hash_insert
  BEFORE INSERT ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_before_insert();

-- ─── No-DELETE (GAP-1) ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tpv_turno_block_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tpv_turnos: DELETE no permitido (SIALTI / Ley 11/2021)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_no_delete
  BEFORE DELETE ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_block_delete();

-- ─── No-UPDATE post-cierre (GAP-4) ───────────────────────────────────────────
-- Bloquea cualquier UPDATE cuando cierre_at ya está seteado.
-- El UPDATE del propio cierre (NULL -> timestamp) es el último UPDATE permitido.
CREATE OR REPLACE FUNCTION tpv_turno_block_update_closed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.cierre_at IS NOT NULL THEN
    RAISE EXCEPTION 'tpv_turnos: turno cerrado, no se puede modificar (SIALTI / Ley 11/2021)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_no_update_closed
  BEFORE UPDATE ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_block_update_closed();
```

- [ ] **Step 2: Aplicar la migración vía MCP**

Usar la herramienta `mcp__supabase__apply_migration` con el contenido del archivo.
Si MCP no está disponible: `supabase db push` o ejecutar el SQL directamente en el panel de Supabase.
Verificar que la tabla tiene las nuevas columnas:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tpv_turnos'
ORDER BY ordinal_position;
-- Esperado: ..., hash_encadenado, efectivo_cierre_teorico_cents
```

- [ ] **Step 3: Verificar que los triggers existen**

```sql
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'tpv_turnos';
-- Esperado: tpv_turno_hash_insert, tpv_turno_no_delete, tpv_turno_no_update_closed
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260714000001_tpv_turnos_inalterabilidad.sql
git commit -m "feat(db): add hash chaining, no-delete, no-update-closed to tpv_turnos (SIALTI)"
```

---

## Task 2: Migración — Tabla `tpv_turno_eventos` (Audit Trail)

Cubre el gap 2. Tabla append-only: ningún rol puede hacer UPDATE ni DELETE.

**Files:**
- Create: `supabase/migrations/20260714000002_tpv_turno_eventos.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- supabase/migrations/20260714000002_tpv_turno_eventos.sql

CREATE TABLE IF NOT EXISTS public.tpv_turno_eventos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id    UUID        NOT NULL REFERENCES public.tpv_turnos(id)  ON DELETE RESTRICT,
  empresa_id  UUID        NOT NULL REFERENCES public.empresas(id)    ON DELETE RESTRICT,
  tipo_evento TEXT        NOT NULL CHECK (tipo_evento IN (
    'apertura',
    'cierre',
    'entrada_caja',
    'salida_caja',
    'apertura_cajon_sin_venta',
    'arqueo_parcial',
    'descuadre'
  )),
  empleado_id UUID,           -- auth.users UUID o empleados_tpv UUID, nullable
  monto_cents INTEGER,        -- NULL para eventos sin movimiento de efectivo
  descripcion TEXT,           -- Obligatorio para entrada_caja / salida_caja
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tpv_turno_eventos_turno
  ON public.tpv_turno_eventos (turno_id);

-- ─── Inalterabilidad total (SIALTI: audit trail) ─────────────────────────────
CREATE OR REPLACE FUNCTION tpv_turno_evento_block_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tpv_turno_eventos: DELETE no permitido (SIALTI audit trail)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_evento_no_delete
  BEFORE DELETE ON public.tpv_turno_eventos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_evento_block_delete();

CREATE OR REPLACE FUNCTION tpv_turno_evento_block_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tpv_turno_eventos: UPDATE no permitido (SIALTI audit trail)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_evento_no_update
  BEFORE UPDATE ON public.tpv_turno_eventos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_evento_block_update();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.tpv_turno_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to tpv_turno_eventos"
  ON public.tpv_turno_eventos FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve tpv_turno_eventos"
  ON public.tpv_turno_eventos FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin registra tpv_turno_eventos"
  ON public.tpv_turno_eventos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- ─── GRANTs ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.tpv_turno_eventos TO service_role;
GRANT SELECT, INSERT ON public.tpv_turno_eventos TO authenticated;
```

- [ ] **Step 2: Aplicar la migración y verificar**

```sql
-- Verificar tabla creada
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'tpv_turno_eventos'
ORDER BY ordinal_position;

-- Verificar triggers
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'tpv_turno_eventos';
-- Esperado: tpv_turno_evento_no_delete, tpv_turno_evento_no_update
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260714000002_tpv_turno_eventos.sql
git commit -m "feat(db): create tpv_turno_eventos append-only audit trail (SIALTI)"
```

---

## Task 3: Domain — Nuevos tipos en `tpv-types.ts` + `ITpvRepository.ts`

**Files:**
- Modify: `src/core/domain/entities/tpv-types.ts`
- Modify: `src/core/domain/repositories/ITpvRepository.ts`

- [ ] **Step 1: Añadir campos a `TpvTurno` y añadir nuevas interfaces en `tpv-types.ts`**

Localizar `TpvTurno` (líneas 1–15) y añadir dos campos al final de la interface.
Añadir las nuevas interfaces después de `TpvAnalytics`.

```typescript
// MODIFY: src/core/domain/entities/tpv-types.ts

export interface TpvTurno {
  id: string;
  empresaId: string;
  userId: string;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string | null;
  efectivoAperturaCents: number;
  efectivoCierreCents: number | null;
  efectivoCierreTeoricoCents: number | null;   // NEW — GAP-5
  totalEfectivoCents: number;
  totalTarjetaCents: number;
  diferenciaCents: number | null;
  requiereRevision: boolean;
  hashEncadenado: string | null;               // NEW — GAP-3
  createdAt: string;
}

// ... (resto del archivo sin cambios hasta el final) ...

// ADD at the end of the file:

export type TipoEventoTurno =
  | 'apertura'
  | 'cierre'
  | 'entrada_caja'
  | 'salida_caja'
  | 'apertura_cajon_sin_venta'
  | 'arqueo_parcial'
  | 'descuadre';

export interface TpvTurnoEvento {
  id: string;
  turnoId: string;
  empresaId: string;
  tipoEvento: TipoEventoTurno;
  empleadoId: string | null;
  montoCents: number | null;
  descripcion: string | null;
  createdAt: string;
}

export interface TpvMovimientoCajaPayload {
  turnoId: string;
  empresaId: string;
  tipoEvento: 'entrada_caja' | 'salida_caja';
  montoCents: number;
  descripcion: string;
  empleadoId?: string;
}
```

- [ ] **Step 2: Actualizar `TpvTurnoStats` y añadir métodos en `ITpvRepository.ts`**

`TpvTurnoStats` (en `tpv-types.ts`, línea 31–35) añade dos campos:

```typescript
export interface TpvTurnoStats {
  totalEfectivoCents: number;
  totalTarjetaCents: number;
  numOperaciones: number;
  efectivoAperturaCents: number;   // NEW — para calcular teórico en cierre
  movimientosNetoCents: number;    // NEW — Σ entradas - Σ salidas del turno
}
```

En `ITpvRepository.ts` añadir dos métodos al final de la interface:

```typescript
// MODIFY: src/core/domain/repositories/ITpvRepository.ts

import { Result } from '@/core/domain/entities/types';
import {
  TpvTurno,
  TpvCobroPayload,
  TpvTurnoStats,
  TpvCobro,
  TpvCobroCompletoPayload,
  TpvAnalytics,
  GetAnalyticsParams,
  TpvTurnoEvento,
  TpvMovimientoCajaPayload,
} from '@/core/domain/entities/tpv-types';

export interface ITpvRepository {
  findTurnoActivo(empresaId: string): Promise<Result<TpvTurno | null>>;
  abrirTurno(params: {
    empresaId: string;
    userId?: string;
    operadorId?: string;
    operadorNombre: string;
    efectivoAperturaCents: number;
  }): Promise<Result<TpvTurno>>;
  cerrarTurno(params: {
    turnoId: string;
    efectivoCierreCents: number;
    efectivoCierreTeoricoCents: number;    // NEW — GAP-5
    diferenciaCents: number;
    empleadoCierreId?: string;             // NEW — para evento 'cierre'
  }): Promise<Result<void>>;
  registrarCobro(payload: TpvCobroPayload): Promise<Result<void>>;
  crearCobroCompleto(payload: TpvCobroCompletoPayload): Promise<Result<TpvCobro>>;
  getTurnoStats(turnoId: string): Promise<Result<TpvTurnoStats>>;
  getAnalytics(params: GetAnalyticsParams): Promise<Result<TpvAnalytics>>;
  // NEW — GAP-6
  registrarMovimientoCaja(payload: TpvMovimientoCajaPayload): Promise<Result<TpvTurnoEvento>>;
  getMovimientosCaja(turnoId: string): Promise<Result<TpvTurnoEvento[]>>;
}
```

- [ ] **Step 3: Verificar que no hay errores de TypeScript**

```bash
pnpm tsc --noEmit 2>&1 | head -40
```

En este punto habrá errores en el repositorio y use-case porque los métodos aún no están implementados. Es esperado.

- [ ] **Step 4: Commit**

```bash
git add src/core/domain/entities/tpv-types.ts \
        src/core/domain/repositories/ITpvRepository.ts
git commit -m "feat(domain): add TpvTurnoEvento types and extend ITpvRepository for SIALTI"
```

---

## Task 4: Repositorio — Implementar nuevos métodos en `supabase-tpv.repository.ts`

**Files:**
- Modify: `src/core/infrastructure/repositories/supabase-tpv.repository.ts`

- [ ] **Step 1: Actualizar `mapRow` para los nuevos campos de `TpvTurno`**

Localizar `function mapRow` (línea 16) y añadir los dos campos nuevos:

```typescript
function mapRow(row: Record<string, unknown>): TpvTurno {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    userId: row.user_id as string,
    operadorNombre: row.operador_nombre as string,
    aperturaAt: row.apertura_at as string,
    cierreAt: row.cierre_at as string | null,
    efectivoAperturaCents: row.efectivo_apertura_cents as number,
    efectivoCierreCents: row.efectivo_cierre_cents as number | null,
    efectivoCierreTeoricoCents: row.efectivo_cierre_teorico_cents as number | null,  // NEW
    totalEfectivoCents: row.total_efectivo_cents as number,
    totalTarjetaCents: row.total_tarjeta_cents as number,
    diferenciaCents: row.diferencia_cents as number | null,
    requiereRevision: row.requiere_revision as boolean,
    hashEncadenado: row.hash_encadenado as string | null,  // NEW
    createdAt: row.created_at as string,
  };
}
```

- [ ] **Step 2: Añadir helper privado `_insertarEvento`**

Añadir el método privado justo antes de `findTurnoActivo` en la clase:

```typescript
private async _insertarEvento(params: {
  turnoId: string;
  empresaId: string;
  tipoEvento: TipoEventoTurno;
  empleadoId?: string;
  montoCents?: number;
  descripcion?: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from('tpv_turno_eventos').insert({
    turno_id: params.turnoId,
    empresa_id: params.empresaId,
    tipo_evento: params.tipoEvento,
    empleado_id: params.empleadoId ?? null,
    monto_cents: params.montoCents ?? null,
    descripcion: params.descripcion ?? null,
  });
  // Errors logged silently — event insertion failure must not block the main operation
}
```

Añadir el import de `TipoEventoTurno` y `TpvTurnoEvento` y `TpvMovimientoCajaPayload` al bloque de imports del archivo:

```typescript
import {
  TpvTurno,
  TpvCobroPayload,
  TpvTurnoStats,
  TpvCobro,
  TpvCobroCompletoPayload,
  TpvAnalytics,
  GetAnalyticsParams,
  TpvTurnoResumen,
  TipoEventoTurno,
  TpvTurnoEvento,
  TpvMovimientoCajaPayload,
} from '@/core/domain/entities/tpv-types';
```

- [ ] **Step 3: Actualizar `abrirTurno` para insertar evento 'apertura'**

Reemplazar el método `abrirTurno` (líneas 70–109) con esta versión que añade el evento:

```typescript
async abrirTurno(params: {
  empresaId: string;
  userId?: string;
  operadorId?: string;
  operadorNombre: string;
  efectivoAperturaCents: number;
}): Promise<Result<TpvTurno>> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('tpv_turnos')
      .insert({
        empresa_id: params.empresaId,
        user_id: params.userId ?? null,
        operador_id: params.operadorId ?? null,
        operador_nombre: params.operadorNombre,
        efectivo_apertura_cents: params.efectivoAperturaCents,
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: await logger.logFromCatch(error, 'repository', 'abrirTurno'),
      };
    }

    const turno = mapRow(data as Record<string, unknown>);

    await this._insertarEvento({
      turnoId: turno.id,
      empresaId: params.empresaId,
      tipoEvento: 'apertura',
      empleadoId: params.userId ?? params.operadorId,
      montoCents: params.efectivoAperturaCents,
      descripcion: `Fondo de apertura: ${params.efectivoAperturaCents} céntimos`,
    });

    return { success: true, data: turno };
  } catch (e) {
    return {
      success: false,
      error: await logger.logFromCatch(e, 'repository', 'abrirTurno'),
    };
  }
}
```

- [ ] **Step 4: Actualizar `cerrarTurno` con nuevos params + eventos 'cierre' y 'descuadre'**

Reemplazar el método `cerrarTurno` (líneas 111–146):

```typescript
async cerrarTurno(params: {
  turnoId: string;
  efectivoCierreCents: number;
  efectivoCierreTeoricoCents: number;
  diferenciaCents: number;
  empleadoCierreId?: string;
}): Promise<Result<void>> {
  try {
    const supabase = getSupabaseClient();
    const { data: turnoRow, error: fetchErr } = await supabase
      .from('tpv_turnos')
      .select('empresa_id')
      .eq('id', params.turnoId)
      .is('cierre_at', null)
      .single();

    if (fetchErr || !turnoRow) {
      return {
        success: false,
        error: await logger.logFromCatch(
          fetchErr ?? new Error('Turno no encontrado o ya cerrado'),
          'repository',
          'cerrarTurno',
        ),
      };
    }

    const empresaId = (turnoRow as Record<string, unknown>).empresa_id as string;

    const { error } = await supabase
      .from('tpv_turnos')
      .update({
        cierre_at: new Date().toISOString(),
        efectivo_cierre_cents: params.efectivoCierreCents,
        efectivo_cierre_teorico_cents: params.efectivoCierreTeoricoCents,
        diferencia_cents: params.diferenciaCents,
      })
      .eq('id', params.turnoId)
      .is('cierre_at', null);

    if (error) {
      return {
        success: false,
        error: await logger.logFromCatch(error, 'repository', 'cerrarTurno'),
      };
    }

    await this._insertarEvento({
      turnoId: params.turnoId,
      empresaId,
      tipoEvento: 'cierre',
      empleadoId: params.empleadoCierreId,
      montoCents: params.efectivoCierreCents,
      descripcion: `Arqueo: declarado ${params.efectivoCierreCents} / teórico ${params.efectivoCierreTeoricoCents}`,
    });

    if (params.diferenciaCents !== 0) {
      await this._insertarEvento({
        turnoId: params.turnoId,
        empresaId,
        tipoEvento: 'descuadre',
        empleadoId: params.empleadoCierreId,
        montoCents: params.diferenciaCents,
        descripcion: `Descuadre de ${params.diferenciaCents} céntimos`,
      });
    }

    return { success: true, data: undefined };
  } catch (e) {
    return {
      success: false,
      error: await logger.logFromCatch(e, 'repository', 'cerrarTurno'),
    };
  }
}
```

- [ ] **Step 5: Actualizar `getTurnoStats` para incluir apertura y movimientos netos**

Reemplazar el método `getTurnoStats` (líneas 268–308):

```typescript
async getTurnoStats(turnoId: string): Promise<Result<TpvTurnoStats>> {
  try {
    const supabase = getSupabaseClient();

    // 1. Turno row (ventas + fondo de apertura)
    const { data, error } = await supabase
      .from('tpv_turnos')
      .select('total_efectivo_cents, total_tarjeta_cents, efectivo_apertura_cents')
      .eq('id', turnoId)
      .single();

    if (error) {
      return {
        success: false,
        error: await logger.logFromCatch(error, 'repository', 'getTurnoStats'),
      };
    }

    const row = data as Record<string, unknown>;

    // 2. Movimientos de caja (entradas - salidas)
    const { data: movs } = await supabase
      .from('tpv_turno_eventos')
      .select('tipo_evento, monto_cents')
      .eq('turno_id', turnoId)
      .in('tipo_evento', ['entrada_caja', 'salida_caja']);

    let movimientosNetoCents = 0;
    for (const m of (movs ?? []) as { tipo_evento: string; monto_cents: number | null }[]) {
      if (m.tipo_evento === 'entrada_caja') {
        movimientosNetoCents += m.monto_cents ?? 0;
      } else {
        movimientosNetoCents -= m.monto_cents ?? 0;
      }
    }

    return {
      success: true,
      data: {
        totalEfectivoCents: row.total_efectivo_cents as number,
        totalTarjetaCents: row.total_tarjeta_cents as number,
        numOperaciones: 0,
        efectivoAperturaCents: row.efectivo_apertura_cents as number,
        movimientosNetoCents,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: await logger.logFromCatch(e, 'repository', 'getTurnoStats'),
    };
  }
}
```

- [ ] **Step 6: Añadir `registrarMovimientoCaja` y `getMovimientosCaja`**

Añadir al final de la clase, antes del cierre `}`:

```typescript
async registrarMovimientoCaja(payload: TpvMovimientoCajaPayload): Promise<Result<TpvTurnoEvento>> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('tpv_turno_eventos')
      .insert({
        turno_id: payload.turnoId,
        empresa_id: payload.empresaId,
        tipo_evento: payload.tipoEvento,
        empleado_id: payload.empleadoId ?? null,
        monto_cents: payload.montoCents,
        descripcion: payload.descripcion,
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: await logger.logFromCatch(error, 'repository', 'registrarMovimientoCaja'),
      };
    }

    const row = data as Record<string, unknown>;
    return {
      success: true,
      data: {
        id: row.id as string,
        turnoId: row.turno_id as string,
        empresaId: row.empresa_id as string,
        tipoEvento: row.tipo_evento as TipoEventoTurno,
        empleadoId: row.empleado_id as string | null,
        montoCents: row.monto_cents as number | null,
        descripcion: row.descripcion as string | null,
        createdAt: row.created_at as string,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: await logger.logFromCatch(e, 'repository', 'registrarMovimientoCaja'),
    };
  }
}

async getMovimientosCaja(turnoId: string): Promise<Result<TpvTurnoEvento[]>> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('tpv_turno_eventos')
      .select('*')
      .eq('turno_id', turnoId)
      .order('created_at', { ascending: true });

    if (error) {
      return {
        success: false,
        error: await logger.logFromCatch(error, 'repository', 'getMovimientosCaja'),
      };
    }

    const eventos: TpvTurnoEvento[] = ((data ?? []) as Record<string, unknown>[]).map(row => ({
      id: row.id as string,
      turnoId: row.turno_id as string,
      empresaId: row.empresa_id as string,
      tipoEvento: row.tipo_evento as TipoEventoTurno,
      empleadoId: row.empleado_id as string | null,
      montoCents: row.monto_cents as number | null,
      descripcion: row.descripcion as string | null,
      createdAt: row.created_at as string,
    }));

    return { success: true, data: eventos };
  } catch (e) {
    return {
      success: false,
      error: await logger.logFromCatch(e, 'repository', 'getMovimientosCaja'),
    };
  }
}
```

- [ ] **Step 7: Verificar compilación TypeScript**

```bash
pnpm tsc --noEmit 2>&1 | head -40
```

Solo deben quedar errores en `cerrar-turno.use-case.ts` (se arregla en Task 5). El repositorio debe compilar sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/core/infrastructure/repositories/supabase-tpv.repository.ts
git commit -m "feat(repo): implement SIALTI audit trail — eventos, hash fields, movimientos caja"
```

---

## Task 5: Use Case — Actualizar `cerrar-turno` + crear `registrar-movimiento-caja`

**Files:**
- Modify: `src/core/application/use-cases/tpv/cerrar-turno.use-case.ts`
- Create: `src/core/application/use-cases/tpv/registrar-movimiento-caja.use-case.ts`

- [ ] **Step 1: Actualizar `cerrar-turno.use-case.ts`**

Reemplazar el archivo completo:

```typescript
// src/core/application/use-cases/tpv/cerrar-turno.use-case.ts

import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import { Result, AppError } from '@/core/domain/entities/types';

interface CerrarTurnoInput {
  turnoId: string;
  efectivoCierreCents: number;
  totalEfectivoTeoricoCents: number;
  empleadoCierreId?: string;
}

export async function cerrarTurnoUseCase(
  repo: ITpvRepository,
  input: CerrarTurnoInput,
): Promise<Result<void, AppError>> {
  const diferenciaCents = input.efectivoCierreCents - input.totalEfectivoTeoricoCents;

  return repo.cerrarTurno({
    turnoId: input.turnoId,
    efectivoCierreCents: input.efectivoCierreCents,
    efectivoCierreTeoricoCents: input.totalEfectivoTeoricoCents,
    diferenciaCents,
    empleadoCierreId: input.empleadoCierreId,
  });
}
```

- [ ] **Step 2: Crear `registrar-movimiento-caja.use-case.ts`**

```typescript
// src/core/application/use-cases/tpv/registrar-movimiento-caja.use-case.ts

import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import { TpvTurnoEvento, TpvMovimientoCajaPayload } from '@/core/domain/entities/tpv-types';
import { Result, AppError } from '@/core/domain/entities/types';

export async function registrarMovimientoCajaUseCase(
  repo: ITpvRepository,
  payload: TpvMovimientoCajaPayload,
): Promise<Result<TpvTurnoEvento, AppError>> {
  if (payload.montoCents <= 0) {
    return {
      success: false,
      error: {
        code: 'TPV_MOVIMIENTO_MONTO_INVALIDO',
        message: 'El monto del movimiento debe ser mayor a 0',
        module: 'use-case',
        method: 'registrarMovimientoCajaUseCase',
      },
    };
  }

  if (!payload.descripcion.trim()) {
    return {
      success: false,
      error: {
        code: 'TPV_MOVIMIENTO_DESCRIPCION_REQUERIDA',
        message: 'La descripción es obligatoria para movimientos de caja (RD 1007/2023)',
        module: 'use-case',
        method: 'registrarMovimientoCajaUseCase',
      },
    };
  }

  return repo.registrarMovimientoCaja({
    ...payload,
    descripcion: payload.descripcion.trim(),
  });
}
```

- [ ] **Step 3: Verificar compilación sin errores**

```bash
pnpm tsc --noEmit 2>&1 | head -40
```

Solo deben quedar errores en las rutas API (se arreglan en Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/core/application/use-cases/tpv/cerrar-turno.use-case.ts \
        src/core/application/use-cases/tpv/registrar-movimiento-caja.use-case.ts
git commit -m "feat(use-case): add efectivoCierreTeoricoCents + registrarMovimientoCaja use-case"
```

---

## Task 6: API Routes — Actualizar cierre + nueva ruta movimiento-caja

**Files:**
- Modify: `src/app/api/tpv/turno/[id]/cerrar/route.ts`
- Create: `src/app/api/tpv/turno/[id]/movimiento-caja/route.ts`

- [ ] **Step 1: Actualizar `cerrar/route.ts`**

El cambio clave: el teórico ahora incluye fondo de apertura y movimientos de caja intermedios.

```typescript
// src/app/api/tpv/turno/[id]/cerrar/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  errorResponse,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository } from '@/core/infrastructure/database';
import { cerrarTurnoUseCase } from '@/core/application/use-cases/tpv/cerrar-turno.use-case';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { z } from 'zod';

const repo = getTpvRepository();

const CerrarSchema = z.object({
  efectivoCierreCents: z.number().int().min(0),
  totalEfectivoTeoricoCents: z.number().int().min(0).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const rol = req.headers.get('x-admin-rol') ?? '';
  const empleadoCierreId =
    req.headers.get('x-admin-id') ?? req.headers.get('x-employee-id') ?? undefined;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CerrarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;

  // Guard: no cerrar si hay mesas con sesión abierta
  const supabase = getSupabaseClient();
  const { data: sesionesAbiertas } = await supabase
    .from('mesa_sesiones')
    .select('id')
    .eq('empresa_id', empresaId)
    .is('cerrada_at', null)
    .limit(1);

  if (sesionesAbiertas && sesionesAbiertas.length > 0) {
    return NextResponse.json(
      { error: 'Hay mesas sin cobrar. Cerrá o cobrá todas las mesas antes de cerrar el turno.' },
      { status: 409 },
    );
  }

  let totalEfectivoTeoricoCents = parsed.data.totalEfectivoTeoricoCents ?? 0;

  // Para cajero (blind close) o cuando no se envía el teórico: calcularlo server-side.
  // Teórico = fondo apertura + ventas en efectivo + Σ entradas - Σ salidas.
  if (rol === 'cajero' || parsed.data.totalEfectivoTeoricoCents === undefined) {
    const statsResult = await repo.getTurnoStats(id);
    if (statsResult.success) {
      totalEfectivoTeoricoCents =
        statsResult.data.efectivoAperturaCents +
        statsResult.data.totalEfectivoCents +
        statsResult.data.movimientosNetoCents;
    }
  }

  const result = await cerrarTurnoUseCase(repo, {
    turnoId: id,
    efectivoCierreCents: parsed.data.efectivoCierreCents,
    totalEfectivoTeoricoCents,
    empleadoCierreId,
  });

  if (!result.success) return errorResponse(result.error.message);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Crear `movimiento-caja/route.ts`**

```typescript
// src/app/api/tpv/turno/[id]/movimiento-caja/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  validationErrorResponse,
  handleResult,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository } from '@/core/infrastructure/database';
import { registrarMovimientoCajaUseCase } from '@/core/application/use-cases/tpv/registrar-movimiento-caja.use-case';
import { z } from 'zod';

const repo = getTpvRepository();

const MovimientoSchema = z.object({
  tipoEvento: z.enum(['entrada_caja', 'salida_caja']),
  montoCents: z.number().int().min(1),
  descripcion: z.string().min(3).max(255),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  // Solo encargado/admin pueden mover efectivo (no cajero)
  const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const empleadoId =
    req.headers.get('x-admin-id') ?? req.headers.get('x-employee-id') ?? undefined;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = MovimientoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;

  const result = await registrarMovimientoCajaUseCase(repo, {
    turnoId: id,
    empresaId,
    tipoEvento: parsed.data.tipoEvento,
    montoCents: parsed.data.montoCents,
    descripcion: parsed.data.descripcion,
    empleadoId,
  });

  return handleResult(result);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  const { id } = await params;

  const result = await repo.getMovimientosCaja(id);
  return handleResult(result);
}
```

- [ ] **Step 3: Verificar compilación limpia**

```bash
pnpm tsc --noEmit 2>&1 | head -40
# Esperado: 0 errores
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tpv/turno/[id]/cerrar/route.ts \
        src/app/api/tpv/turno/[id]/movimiento-caja/route.ts
git commit -m "feat(api): update cerrar-turno teorico + add movimiento-caja endpoint (SIALTI)"
```

---

## Task 7: Lint + actualizar `docs/tpv-legal-compliance.md`

**Files:**
- Modify: `docs/tpv-legal-compliance.md`

- [ ] **Step 1: Lint**

```bash
pnpm lint 2>&1 | tail -20
# Resolver cualquier error antes de continuar.
```

- [ ] **Step 2: Actualizar el doc de compliance**

Añadir una nueva sección al final del `docs/tpv-legal-compliance.md`, antes del historial de versiones:

```markdown
---

## 9. SIALTI — Trazabilidad e Inalterabilidad de Turnos (RD 1007/2023)

### 9.1 Inalterabilidad de `tpv_turnos`

- [x] **No-DELETE en `tpv_turnos`** — Trigger `tpv_turno_no_delete` raises EXCEPTION (20260714).
- [x] **No-UPDATE post-cierre** — Trigger `tpv_turno_no_update_closed`: bloquea cualquier UPDATE cuando `cierre_at IS NOT NULL` (20260714).
- [x] **Hash chaining en `tpv_turnos`** — Columna `hash_encadenado TEXT`. Trigger `tpv_turno_hash_insert`: SHA-256 de `empresa_id|id|efectivo_apertura|apertura_at|prev_hash` (20260714).
- [x] **`efectivo_cierre_teorico_cents`** persistido explícitamente en `tpv_turnos` (20260714).

### 9.2 Audit Trail de Eventos (`tpv_turno_eventos`)

- [x] **Tabla `tpv_turno_eventos`** — Append-only: triggers `BEFORE DELETE` y `BEFORE UPDATE` lanzan EXCEPTION (20260714).
- [x] **Evento 'apertura'** insertado automáticamente por `abrirTurno` (repo layer) (20260714).
- [x] **Evento 'cierre'** insertado automáticamente por `cerrarTurno` (repo layer) (20260714).
- [x] **Evento 'descuadre'** insertado automáticamente si `diferenciaCents !== 0` (20260714).
- [x] **Tipos de evento** validados via CHECK constraint: apertura, cierre, entrada_caja, salida_caja, apertura_cajon_sin_venta, arqueo_parcial, descuadre (20260714).

### 9.3 Movimientos de Caja Intermedios

- [x] **Endpoint `POST /api/tpv/turno/[id]/movimiento-caja`** — entrada_caja / salida_caja. Solo encargado/admin. Descripción obligatoria (20260714).
- [x] **Endpoint `GET /api/tpv/turno/[id]/movimiento-caja`** — historial de movimientos del turno (20260714).
- [x] **Teórico de cierre corregido** — incluye fondo de apertura + ventas efectivo + Σ entradas - Σ salidas (20260714).
```

Añadir al historial de versiones:

```markdown
| 1.4     | 2026-07-14 | Sección 9: SIALTI turnos — hash chaining, no-delete, no-update-closed, tpv_turno_eventos, movimientos de caja, teórico de cierre corregido |
```

- [ ] **Step 3: Commit final**

```bash
git add docs/tpv-legal-compliance.md
git commit -m "docs: update legal compliance — SIALTI turnos gaps closed (20260714)"
```

---

## Self-Review

### Spec coverage

| Gap | Task |
|-----|------|
| GAP-1 — No-DELETE en tpv_turnos | Task 1 |
| GAP-2 — tpv_turno_eventos audit trail | Task 2 + Task 4 (repo) |
| GAP-3 — Hash chaining en tpv_turnos | Task 1 |
| GAP-4 — No-UPDATE post-cierre en tpv_turnos | Task 1 |
| GAP-5 — efectivo_cierre_teorico_cents persistido | Task 1 (col) + Task 4 (repo) + Task 5 (use-case) |
| GAP-6 — Movimientos de caja + teórico correcto | Task 2 (tabla) + Task 4 (repo) + Task 5 (use-case) + Task 6 (routes) |

Todos los gaps cubiertos.

### Type consistency

- `TpvTurnoStats` añade `efectivoAperturaCents` y `movimientosNetoCents` — usados en Task 6 (`cerrar/route.ts`).
- `cerrarTurno` repo signature añade `efectivoCierreTeoricoCents` y `empleadoCierreId` — pasados desde `cerrarTurnoUseCase`.
- `_insertarEvento` es privado — no expuesto en la interface, solo usado internamente en el repo.
- `TipoEventoTurno` importado en el repo desde `tpv-types.ts` — consistente con el CHECK constraint de la migración.

### Notas para el ejecutor

- Las migraciones deben aplicarse en orden: `000001` antes que `000002`.
- El trigger `tpv_turno_hash_insert` NO retroactiva los turnos existentes (no tienen `hash_encadenado`). Esto es correcto: los turnos anteriores al parche son pre-SIALTI. El primer turno creado después del parche arranca la cadena con `INICIO`.
- `_insertarEvento` usa silent failure intencional: si falla la inserción del evento (problema de red, tabla no existe), la operación principal (abrir/cerrar turno) no se revierte. Esto protege la operatividad del local. En un entorno de producción maduro, esto debería ser una transacción. Para el MVP actual, la monitorización vía Sentry captura el error.
