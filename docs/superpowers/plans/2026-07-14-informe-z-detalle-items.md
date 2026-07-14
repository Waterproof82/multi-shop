# Informe Z + Desglose de Ítems en Ticket — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el Informe Z de cierre fiscal y el desglose de ítems por ticket para cumplir con el RD 1619/2012.

**Architecture:** DB migration adds `numero_z` to `tpv_turnos` (trigger BEFORE UPDATE at close) and `detalle_items JSONB` to `tpv_cobros`. The cobro route auto-populates `detalle_items` server-side from `pedidos.detalle_pedido`. After closing a turno, `TurnoCerrarForm` fetches `GET /api/tpv/turno/[id]/informe-z` and shows `InformeZModal` which auto-triggers `window.print()`.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL triggers), TypeScript, Tailwind v4, Clean Architecture (API Route → Use Case → Repository → Domain).

**Spec:** `docs/superpowers/specs/2026-07-14-informe-z-detalle-items-design.md`

---

## File Map

| Action | File |
|--------|------|
| CREATE | `supabase/migrations/20260714000003_tpv_numero_z_detalle_items.sql` |
| MODIFY | `src/core/domain/entities/tpv-types.ts` |
| MODIFY | `src/core/domain/repositories/ITpvRepository.ts` |
| MODIFY | `src/core/infrastructure/repositories/supabase-tpv.repository.ts` |
| MODIFY | `src/core/application/use-cases/tpv/registrar-cobro.use-case.ts` |
| MODIFY | `src/app/api/tpv/cobro/route.ts` |
| MODIFY | `src/app/api/tpv/cobro/rectificar/route.ts` |
| CREATE | `src/app/api/tpv/turno/[id]/informe-z/route.ts` |
| CREATE | `src/components/tpv/InformeZModal.tsx` |
| MODIFY | `src/components/tpv/TurnoCerrarForm.tsx` |
| MODIFY | `src/components/tpv/cobro/CobroConfirmado.tsx` |
| MODIFY | `docs/tpv-legal-compliance.md` |

---

## Task 1: DB Migration — `numero_z` + `detalle_items`

**Files:**
- Create: `supabase/migrations/20260714000003_tpv_numero_z_detalle_items.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260714000003_tpv_numero_z_detalle_items.sql

-- ─── 1. numero_z en tpv_turnos ───────────────────────────────────────────────
-- Número Z secuencial por empresa, asignado al cerrar el turno.

ALTER TABLE public.tpv_turnos
  ADD COLUMN IF NOT EXISTS numero_z BIGINT;

-- Trigger BEFORE UPDATE que asigna el siguiente numero_z al cerrar.
-- Nombre 'tpv_turno_assign_z' corre antes de 'tpv_turno_no_update_fields'
-- (orden alfabético de triggers BEFORE UPDATE en la misma tabla).
CREATE OR REPLACE FUNCTION tpv_turno_assign_numero_z()
RETURNS TRIGGER AS $$
DECLARE
  next_z BIGINT;
BEGIN
  -- Solo asignar al momento exacto del cierre (NULL → NOT NULL) y si no está ya asignado
  IF OLD.cierre_at IS NULL AND NEW.cierre_at IS NOT NULL AND NEW.numero_z IS NULL THEN
    SELECT COALESCE(MAX(numero_z), 0) + 1
      INTO next_z
      FROM public.tpv_turnos
     WHERE empresa_id = NEW.empresa_id
       FOR UPDATE;
    NEW.numero_z := next_z;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_assign_z
  BEFORE UPDATE ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_assign_numero_z();

-- ─── 2. detalle_items en tpv_cobros ──────────────────────────────────────────
-- Desglose de ítems del ticket en JSONB.
-- Formato: [{ "nombre": "...", "cantidad": N, "precioUnitarioCents": N }]

ALTER TABLE public.tpv_cobros
  ADD COLUMN IF NOT EXISTS detalle_items JSONB;

-- Actualizar trigger de inmutabilidad para proteger también detalle_items.
-- (La función existente es reemplazada; el trigger tpv_cobro_no_update_critical
--  ya apunta a ella y sigue activo sin necesidad de recrearlo.)
CREATE OR REPLACE FUNCTION tpv_cobro_block_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.numero_ticket         <> NEW.numero_ticket         OR
     OLD.importe_cobrado_cents <> NEW.importe_cobrado_cents OR
     OLD.metodo_pago           <> NEW.metodo_pago           OR
     OLD.hash                  <> NEW.hash                  OR
     OLD.empresa_id            <> NEW.empresa_id            OR
     OLD.detalle_items IS DISTINCT FROM NEW.detalle_items   THEN
    RAISE EXCEPTION 'tpv_cobros: campos fiscales inmutables (RD 1619/2012)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Apply the migration via MCP**

Use `mcp__supabase__apply_migration` with:
- `name`: `20260714000003_tpv_numero_z_detalle_items`
- `query`: contents of the migration file above

Expected: Migration applied successfully with no errors.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/PC/Desktop/multi_shop
git add supabase/migrations/20260714000003_tpv_numero_z_detalle_items.sql
git commit -m "feat(tpv): add numero_z to tpv_turnos and detalle_items to tpv_cobros"
```

---

## Task 2: Domain Types

**Files:**
- Modify: `src/core/domain/entities/tpv-types.ts`

- [ ] **Step 1: Read the current file**

Read `src/core/domain/entities/tpv-types.ts` in full.

- [ ] **Step 2: Add new types after the `TipoImpuesto` line (~line 103)**

Add these interfaces after `export type TipoImpuesto = 'iva' | 'igic';`:

```typescript
export interface TpvDetalleItem {
  nombre: string;
  cantidad: number;
  precioUnitarioCents: number;
}

export interface InformeZDesglosePago {
  metodoPago: MetodoPago;
  totalCents: number;
  numOperaciones: number;
}

export interface InformeZData {
  // Turno
  turnoId: string;
  numeroZ: number;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string;
  hashEncadenado: string;
  // Empresa
  empresaNombre: string;
  empresaNif: string | null;
  tipoImpuesto: TipoImpuesto;
  // Totales del turno
  efectivoAperturaCents: number;
  efectivoCierreCents: number;
  efectivoCierreTeoricoCents: number;
  diferenciaCents: number;
  // Agregados de cobros del turno
  totalFacturadoCents: number;
  baseImponibleCents: number;
  ivaCents: number;
  propinaCents: number;
  numCobros: number;
  desglosePagos: InformeZDesglosePago[];
  // Movimientos de caja del turno
  movimientos: TpvTurnoEvento[];
}
```

- [ ] **Step 3: Extend `TpvCobro` with `detalleItems`**

In the `TpvCobro` interface, add after `rectificaCobroId`:

```typescript
detalleItems: TpvDetalleItem[] | null;
```

- [ ] **Step 4: Extend `TpvCobroCompletoPayload` with `detalleItems`**

In `TpvCobroCompletoPayload`, add after `rectificaCobroId`:

```typescript
detalleItems?: TpvDetalleItem[];
```

- [ ] **Step 5: Extend `TpvCobroPayload` with `detalleItems`**

In `TpvCobroPayload`, add after `cerrarSesion?`:

```typescript
detalleItems?: TpvDetalleItem[];
```

- [ ] **Step 6: Commit**

```bash
git add src/core/domain/entities/tpv-types.ts
git commit -m "feat(tpv): add TpvDetalleItem, InformeZData types and extend TpvCobro payload"
```

---

## Task 3: Repository Interface

**Files:**
- Modify: `src/core/domain/repositories/ITpvRepository.ts`

- [ ] **Step 1: Read the current file**

Read `src/core/domain/repositories/ITpvRepository.ts` in full.

- [ ] **Step 2: Add `InformeZData` import**

Update the import from `tpv-types` to include `InformeZData`:

```typescript
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
  InformeZData,
} from '@/core/domain/entities/tpv-types';
```

- [ ] **Step 3: Add `getInformeZ` method to the interface**

Add after `getMovimientosCaja`:

```typescript
getInformeZ(turnoId: string, empresaId: string): Promise<Result<InformeZData>>;
```

- [ ] **Step 4: Commit**

```bash
git add src/core/domain/repositories/ITpvRepository.ts
git commit -m "feat(tpv): add getInformeZ to ITpvRepository interface"
```

---

## Task 4: Repository Implementation

**Files:**
- Modify: `src/core/infrastructure/repositories/supabase-tpv.repository.ts`

- [ ] **Step 1: Read the current file**

Read `src/core/infrastructure/repositories/supabase-tpv.repository.ts` in full.

- [ ] **Step 2: Add new type imports**

Add `InformeZData`, `InformeZDesglosePago`, `TpvDetalleItem`, `TipoImpuesto` to the existing import:

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
  InformeZData,
  InformeZDesglosePago,
  TpvDetalleItem,
  TipoImpuesto,
  MetodoPago,
} from '@/core/domain/entities/tpv-types';
```

- [ ] **Step 3: Update `crearCobroCompleto` — add `detalle_items` to INSERT**

In the `crearCobroCompleto` method, update the `.insert({...})` call to add:

```typescript
detalle_items: payload.detalleItems ?? null,
```

The full insert object becomes:

```typescript
const { data: cobro, error: cobroErr } = await supabase
  .from('tpv_cobros')
  .insert({
    empresa_id: payload.empresaId,
    turno_id: payload.turnoId,
    sesion_id: payload.sesionId ?? null,
    metodo_pago: payload.metodoPago,
    importe_cobrado_cents: payload.importeCobradoCents,
    propina_cents: payload.propinaCents,
    descuento_cents: payload.descuentoCents ?? 0,
    iva_porcentaje: payload.ivaPorcentaje ?? 10,
    rectifica_cobro_id: payload.rectificaCobroId ?? null,
    detalle_items: payload.detalleItems ?? null,
  })
  .select()
  .single();
```

- [ ] **Step 4: Update `crearCobroCompleto` return value — add `detalleItems`**

In the `return { success: true, data: { ... } }` block, add:

```typescript
detalleItems: (row.detalle_items as TpvDetalleItem[] | null) ?? null,
```

The full return `data` object:

```typescript
return {
  success: true,
  data: {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    turnoId: row.turno_id as string,
    sesionId: row.sesion_id as string | null,
    numeroTicket: row.numero_ticket as number,
    serie: row.serie as string,
    metodoPago: row.metodo_pago as TpvCobro['metodoPago'],
    importeCobradoCents: row.importe_cobrado_cents as number,
    propinaCents: row.propina_cents as number,
    descuentoCents: (row.descuento_cents as number) ?? 0,
    ivaPorcentaje: Number(row.iva_porcentaje),
    baseImponibleCents: row.base_imponible_cents as number,
    ivaCents: row.iva_cents as number,
    hashAnterior: row.hash_anterior as string | null,
    hash: row.hash as string,
    cobradoAt: row.cobrado_at as string,
    rectificaCobroId: row.rectifica_cobro_id as string | null ?? null,
    detalleItems: (row.detalle_items as TpvDetalleItem[] | null) ?? null,
  },
};
```

- [ ] **Step 5: Add `getInformeZ` method at the end of the class**

Add this method before the closing `}` of `SupabaseTpvRepository`:

```typescript
async getInformeZ(turnoId: string, empresaId: string): Promise<Result<InformeZData>> {
  try {
    const supabase = getSupabaseClient();

    const [turnoRes, empresaRes, cobrosRes, eventosRes] = await Promise.all([
      supabase
        .from('tpv_turnos')
        .select(
          'id, numero_z, operador_nombre, apertura_at, cierre_at, hash_encadenado, ' +
          'efectivo_apertura_cents, efectivo_cierre_cents, efectivo_cierre_teorico_cents, diferencia_cents'
        )
        .eq('id', turnoId)
        .eq('empresa_id', empresaId)
        .single(),
      supabase
        .from('empresas')
        .select('nombre, nif, tipo_impuesto')
        .eq('id', empresaId)
        .single(),
      supabase
        .from('tpv_cobros')
        .select('metodo_pago, importe_cobrado_cents, base_imponible_cents, iva_cents, propina_cents')
        .eq('turno_id', turnoId),
      supabase
        .from('tpv_turno_eventos')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: true }),
    ]);

    if (turnoRes.error || !turnoRes.data) {
      return {
        success: false,
        error: await logger.logFromCatch(
          turnoRes.error ?? new Error('Turno no encontrado'),
          'repository',
          'getInformeZ/turno',
        ),
      };
    }

    const t = turnoRes.data as Record<string, unknown>;
    const empresa = (empresaRes.data ?? {}) as Record<string, unknown>;

    type CobroRow = {
      metodo_pago: string;
      importe_cobrado_cents: number;
      base_imponible_cents: number;
      iva_cents: number;
      propina_cents: number;
    };
    const cobros = (cobrosRes.data ?? []) as CobroRow[];

    // Aggregate totals and group by metodo_pago
    const pagosMap = new Map<string, { totalCents: number; numOperaciones: number }>();
    let totalFacturadoCents = 0;
    let baseImponibleCents = 0;
    let ivaCents = 0;
    let propinaCents = 0;

    for (const c of cobros) {
      const prev = pagosMap.get(c.metodo_pago) ?? { totalCents: 0, numOperaciones: 0 };
      pagosMap.set(c.metodo_pago, {
        totalCents: prev.totalCents + c.importe_cobrado_cents,
        numOperaciones: prev.numOperaciones + 1,
      });
      totalFacturadoCents += c.importe_cobrado_cents;
      baseImponibleCents += c.base_imponible_cents;
      ivaCents += c.iva_cents;
      propinaCents += c.propina_cents;
    }

    const desglosePagos: InformeZDesglosePago[] = Array.from(pagosMap.entries()).map(
      ([metodoPago, v]) => ({ metodoPago: metodoPago as MetodoPago, ...v })
    );

    return {
      success: true,
      data: {
        turnoId: t.id as string,
        numeroZ: t.numero_z as number,
        operadorNombre: t.operador_nombre as string,
        aperturaAt: t.apertura_at as string,
        cierreAt: t.cierre_at as string,
        hashEncadenado: t.hash_encadenado as string,
        empresaNombre: (empresa.nombre as string) ?? '',
        empresaNif: (empresa.nif as string | null) ?? null,
        tipoImpuesto: ((empresa.tipo_impuesto as TipoImpuesto) ?? 'iva'),
        efectivoAperturaCents: t.efectivo_apertura_cents as number,
        efectivoCierreCents: (t.efectivo_cierre_cents as number) ?? 0,
        efectivoCierreTeoricoCents: (t.efectivo_cierre_teorico_cents as number) ?? 0,
        diferenciaCents: (t.diferencia_cents as number) ?? 0,
        totalFacturadoCents,
        baseImponibleCents,
        ivaCents,
        propinaCents,
        numCobros: cobros.length,
        desglosePagos,
        movimientos: ((eventosRes.data ?? []) as Record<string, unknown>[]).map(mapEvento),
      },
    };
  } catch (e) {
    return {
      success: false,
      error: await logger.logFromCatch(e, 'repository', 'getInformeZ'),
    };
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/core/infrastructure/repositories/supabase-tpv.repository.ts
git commit -m "feat(tpv): implement getInformeZ and add detalle_items to crearCobroCompleto"
```

---

## Task 5: Use Case — Pass `detalleItems` Through

**Files:**
- Modify: `src/core/application/use-cases/tpv/registrar-cobro.use-case.ts`

- [ ] **Step 1: Read the current file**

Read `src/core/application/use-cases/tpv/registrar-cobro.use-case.ts` in full.

- [ ] **Step 2: Pass `detalleItems` to `crearCobroCompleto`**

In the final `return repo.crearCobroCompleto({...})` call, add:

```typescript
return repo.crearCobroCompleto({
  empresaId: payload.empresaId,
  turnoId: payload.turnoId,
  sesionId: payload.sesionId,
  metodoPago: payload.metodoPago,
  importeCobradoCents: payload.importeCobradoCents,
  propinaCents: payload.propinaCents,
  descuentoCents: payload.descuentoCents,
  ivaPorcentaje: payload.ivaPorcentaje,
  detalleItems: payload.detalleItems,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/core/application/use-cases/tpv/registrar-cobro.use-case.ts
git commit -m "feat(tpv): pass detalleItems through registrarCobroUseCase"
```

---

## Task 6: Cobro API Route — Auto-populate `detalle_items` from Pedidos

**Files:**
- Modify: `src/app/api/tpv/cobro/route.ts`

- [ ] **Step 1: Read the current file**

Read `src/app/api/tpv/cobro/route.ts` in full.

- [ ] **Step 2: Write the updated route**

Replace the file entirely with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { registrarCobroUseCase } from '@/core/application/use-cases/tpv/registrar-cobro.use-case';
import type { TpvDetalleItem } from '@/core/domain/entities/tpv-types';
import { z } from 'zod';

const DetalleItemSchema = z.object({
  nombre: z.string().max(200),
  cantidad: z.number().int().positive(),
  precioUnitarioCents: z.number().int().min(0),
});

const CobroSchema = z.object({
  sesionId: z.string().uuid(),
  metodoPago: z.enum(['efectivo', 'tarjeta']),
  importeCobradoCents: z.number().int().positive(),
  propinaCents: z.number().int().min(0),
  descuentoCents: z.number().int().min(0).optional().default(0),
  turnoId: z.string().uuid(),
  ivaPorcentaje: z.number().min(0).max(30).optional().default(10),
  cerrarSesion: z.boolean().optional().default(true),
  detalleItems: z.array(DetalleItemSchema).optional(),
});

interface RawPedido {
  detalle_pedido: Array<{ nombre?: string; precio?: number; cantidad?: number }> | null;
}

function buildDetalleItems(pedidos: RawPedido[]): TpvDetalleItem[] {
  const map = new Map<string, { cantidad: number; precioUnitarioCents: number }>();
  for (const pedido of pedidos) {
    for (const item of pedido.detalle_pedido ?? []) {
      const key = item.nombre ?? '';
      const prev = map.get(key) ?? {
        cantidad: 0,
        precioUnitarioCents: Math.round((item.precio ?? 0) * 100),
      };
      map.set(key, { ...prev, cantidad: prev.cantidad + (item.cantidad ?? 1) });
    }
  }
  return Array.from(map.entries()).map(([nombre, v]) => ({ nombre, ...v }));
}

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CobroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Auto-populate detalle_items from pedidos if client did not send them.
  // This is the mesa flow: server fetches from the DB (source of truth).
  let detalleItems = parsed.data.detalleItems;
  if (!detalleItems) {
    const supabase = getSupabaseClient();
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('detalle_pedido')
      .eq('sesion_id', parsed.data.sesionId)
      .neq('estado', 'cancelado');

    if (pedidos && pedidos.length > 0) {
      detalleItems = buildDetalleItems(pedidos as RawPedido[]);
    }
  }

  const repo = getTpvRepository();
  const result = await registrarCobroUseCase(repo, {
    ...parsed.data,
    empresaId,
    cerrarSesion: parsed.data.cerrarSesion,
    detalleItems,
  });
  return handleResult(result);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tpv/cobro/route.ts
git commit -m "feat(tpv): auto-populate detalle_items from pedidos in cobro route"
```

---

## Task 7: Rectificar Route — Inherit `detalle_items` from Original

**Files:**
- Modify: `src/app/api/tpv/cobro/rectificar/route.ts`

- [ ] **Step 1: Read the current file**

Read `src/app/api/tpv/cobro/rectificar/route.ts` in full.

- [ ] **Step 2: Update `CobrosRow` type to include `detalle_items`**

Update the type definition:

```typescript
type CobrosRow = {
  id: string;
  empresa_id: string;
  turno_id: string;
  metodo_pago: string;
  importe_cobrado_cents: number;
  propina_cents: number;
  iva_porcentaje: string;
  rectifica_cobro_id: string | null;
  detalle_items: unknown;
};
```

- [ ] **Step 3: Add `detalle_items` to the SELECT**

Update the select query to include `detalle_items`:

```typescript
const { data: original, error: fetchErr } = await supabase
  .from('tpv_cobros')
  .select('id, empresa_id, turno_id, metodo_pago, importe_cobrado_cents, propina_cents, iva_porcentaje, rectifica_cobro_id, detalle_items')
  .eq('id', parsed.data.cobroId)
  .eq('empresa_id', empresaId)
  .maybeSingle();
```

- [ ] **Step 4: Add `TpvDetalleItem` import**

At the top of the file, add:

```typescript
import type { TpvDetalleItem } from '@/core/domain/entities/tpv-types';
```

- [ ] **Step 5: Pass `detalle_items` to `crearCobroCompleto`**

Update the `crearCobroCompleto` call:

```typescript
const result = await repo.crearCobroCompleto({
  empresaId,
  turnoId: turnoResult.data.id,
  sesionId: null,
  metodoPago: orig.metodo_pago as 'efectivo' | 'tarjeta',
  importeCobradoCents: -orig.importe_cobrado_cents,
  propinaCents: -orig.propina_cents,
  ivaPorcentaje: Number(orig.iva_porcentaje),
  rectificaCobroId: orig.id,
  detalleItems: orig.detalle_items ? (orig.detalle_items as TpvDetalleItem[]) : undefined,
});
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tpv/cobro/rectificar/route.ts
git commit -m "feat(tpv): pass detalle_items from original cobro to rectificativo"
```

---

## Task 8: Informe Z API Route

**Files:**
- Create: `src/app/api/tpv/turno/[id]/informe-z/route.ts`

- [ ] **Step 1: Create the directory and route file**

```typescript
// src/app/api/tpv/turno/[id]/informe-z/route.ts
import { NextRequest } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository } from '@/core/infrastructure/database';

const repo = getTpvRepository();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  // Todos los roles TPV pueden ver el Informe Z de su empresa
  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id } = await params;

  const result = await repo.getInformeZ(id, empresaId);
  return handleResult(result);
}
```

- [ ] **Step 2: Verify the directory exists**

The path `src/app/api/tpv/turno/[id]/` already exists (contains `cerrar/` and `movimiento-caja/`). Create the new subdirectory `informe-z/` with the file above.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tpv/turno/
git commit -m "feat(tpv): add GET /api/tpv/turno/[id]/informe-z endpoint"
```

---

## Task 9: `InformeZModal` Component

**Files:**
- Create: `src/components/tpv/InformeZModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/tpv/InformeZModal.tsx
'use client';

import { useEffect } from 'react';
import type { InformeZData } from '@/core/domain/entities/tpv-types';

interface Props {
  readonly informeZ: InformeZData;
  readonly onClose: () => void;
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
}

function getDiferencia(cents: number): string {
  return (cents >= 0 ? '+' : '') + fmt(cents);
}

export function InformeZModal({ informeZ, onClose }: Props) {
  // Auto-trigger print 400ms after mount to give DOM time to render.
  // Electron intercepts window.print() via the existing IPC and sends to configured printer.
  useEffect(() => {
    const t = setTimeout(() => { window.print(); }, 400);
    return () => clearTimeout(t);
  }, []);

  const numZ = String(informeZ.numeroZ).padStart(5, '0');
  const impuestoLabel = informeZ.tipoImpuesto === 'igic' ? 'IGIC' : 'IVA';
  const movimientosCaja = informeZ.movimientos.filter(
    m => m.tipoEvento === 'entrada_caja' || m.tipoEvento === 'salida_caja',
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 print:bg-white print:block print:items-start print:justify-start">
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-8 w-[480px] max-h-[90vh] overflow-y-auto print:bg-white print:text-black print:border-none print:rounded-none print:p-4 print:w-full print:max-h-none print:overflow-visible">

        {/* Cabecera empresa */}
        <div className="text-center mb-3">
          <p className="font-bold text-lg print:text-black">{informeZ.empresaNombre}</p>
          {informeZ.empresaNif !== null && (
            <p className="text-sm text-[#6b7280] print:text-black">NIF: {informeZ.empresaNif}</p>
          )}
        </div>

        <div className="border-t border-[#2e3347] print:border-black my-2" />

        <h2 className="text-center font-bold text-xl my-3 print:text-black">
          INFORME Z Nº {numZ}
        </h2>

        <div className="border-t border-[#2e3347] print:border-black my-2" />

        {/* Datos del turno */}
        <div className="flex flex-col gap-1 text-sm mb-4">
          <Row label="Apertura" value={fmtDateTime(informeZ.aperturaAt)} />
          <Row label="Cierre" value={fmtDateTime(informeZ.cierreAt)} />
          <Row label="Operador" value={informeZ.operadorNombre} />
        </div>

        <div className="border-t border-[#2e3347] print:border-black my-2" />

        {/* Ventas */}
        <p className="font-bold text-xs uppercase tracking-wider mb-2 text-[#6b7280] print:text-black">
          VENTAS
        </p>
        {informeZ.desglosePagos.map(p => (
          <Row
            key={p.metodoPago}
            label={p.metodoPago.charAt(0).toUpperCase() + p.metodoPago.slice(1) + ':'}
            value={fmt(p.totalCents)}
          />
        ))}
        <Row label="Nº operaciones:" value={String(informeZ.numCobros)} />

        <div className="border-t border-[#2e3347] print:border-black my-2" />

        {/* Fiscalidad */}
        <p className="font-bold text-xs uppercase tracking-wider mb-2 text-[#6b7280] print:text-black">
          FISCALIDAD ({impuestoLabel})
        </p>
        <Row label="Base imponible:" value={fmt(informeZ.baseImponibleCents)} />
        <Row label={`Cuota ${impuestoLabel}:`} value={fmt(informeZ.ivaCents)} />
        {informeZ.propinaCents > 0 && (
          <Row label="Propinas (exento):" value={fmt(informeZ.propinaCents)} />
        )}
        <div className="flex justify-between text-sm font-bold mt-1">
          <span>TOTAL:</span>
          <span>{fmt(informeZ.totalFacturadoCents)}</span>
        </div>

        <div className="border-t border-[#2e3347] print:border-black my-2" />

        {/* Arqueo de caja */}
        <p className="font-bold text-xs uppercase tracking-wider mb-2 text-[#6b7280] print:text-black">
          ARQUEO DE CAJA
        </p>
        <Row label="Fondo apertura:" value={fmt(informeZ.efectivoAperturaCents)} />
        {movimientosCaja.map(m => (
          <div key={m.id} className="flex justify-between text-xs text-[#6b7280] print:text-black">
            <span>
              {m.tipoEvento === 'entrada_caja' ? '+ ' : '- '}
              {m.descripcion ?? m.tipoEvento}
            </span>
            <span>{fmt(m.montoCents ?? 0)}</span>
          </div>
        ))}
        <Row label="Efectivo teórico:" value={fmt(informeZ.efectivoCierreTeoricoCents)} />
        <Row label="Efectivo contado:" value={fmt(informeZ.efectivoCierreCents)} />
        <div className="flex justify-between text-sm font-bold">
          <span>Descuadre:</span>
          <span className={informeZ.diferenciaCents === 0 ? 'text-[#22c55e] print:text-black' : 'text-[#ef4444] print:text-black'}>
            {getDiferencia(informeZ.diferenciaCents)}
          </span>
        </div>

        <div className="border-t border-[#2e3347] print:border-black my-2" />

        {/* Huella digital */}
        <p className="font-bold text-xs uppercase tracking-wider mb-1 text-[#6b7280] print:text-black">
          HUELLA DIGITAL
        </p>
        <p className="font-mono text-xs break-all text-[#6b7280] print:text-black">
          {informeZ.hashEncadenado}
        </p>

        {/* Botón finalizar — solo en pantalla, oculto en impresión */}
        <div className="mt-6 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 rounded-xl bg-[#22c55e] text-white font-bold hover:brightness-110 transition-all"
          >
            Finalizar turno
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[#6b7280] print:text-black">{label}</span>
      <span className="print:text-black">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tpv/InformeZModal.tsx
git commit -m "feat(tpv): add InformeZModal component with auto window.print()"
```

---

## Task 10: `TurnoCerrarForm` — Add Informe Z Step

**Files:**
- Modify: `src/components/tpv/TurnoCerrarForm.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/tpv/TurnoCerrarForm.tsx` in full.

- [ ] **Step 2: Add imports**

Add to the imports at the top:

```typescript
import type { InformeZData } from '@/core/domain/entities/tpv-types';
import { InformeZModal } from '@/components/tpv/InformeZModal';
```

- [ ] **Step 3: Add state for the informe Z step**

Inside `TurnoCerrarForm`, after the existing `useState` declarations, add:

```typescript
type FormStep = 'idle' | 'loading' | 'informe-z';
const [formStep, setFormStep] = useState<FormStep>('idle');
const [informeZ, setInformeZ] = useState<InformeZData | null>(null);
```

Replace the existing `const [loading, setLoading] = useState(false);` — the new `formStep` tracks loading state too, so keep `loading` as a local boolean for the button spinner OR keep both:

```typescript
const [loading, setLoading] = useState(false);
const [informeZ, setInformeZ] = useState<InformeZData | null>(null);
const [showInformeZ, setShowInformeZ] = useState(false);
```

- [ ] **Step 4: Update `handleCierre` — show Informe Z after successful close**

Replace the `if (res.ok)` branch inside `handleCierre`:

```typescript
if (res.ok) {
  setTurno(null);
  // Fetch Informe Z — shown before redirecting so the encargado can review and print.
  try {
    const izRes = await fetch(`/api/tpv/turno/${turno.id}/informe-z`, {
      headers: { ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
    });
    if (izRes.ok) {
      const iz = (await izRes.json()) as InformeZData;
      setInformeZ(iz);
      setShowInformeZ(true);
      return; // Navigation happens when user clicks "Finalizar turno" in the modal
    }
  } catch {
    // If Informe Z fetch fails, proceed directly to navigation
  }
  router.push('/tpv/turno/abrir');
}
```

- [ ] **Step 5: Add Informe Z modal render before the form return**

Add before `return (`:

```typescript
if (showInformeZ && informeZ !== null) {
  return (
    <InformeZModal
      informeZ={informeZ}
      onClose={() => router.push('/tpv/turno/abrir')}
    />
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/tpv/TurnoCerrarForm.tsx
git commit -m "feat(tpv): show InformeZModal after turno close before redirecting"
```

---

## Task 11: `CobroConfirmado` — Show Item Lines

**Files:**
- Modify: `src/components/tpv/cobro/CobroConfirmado.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/tpv/cobro/CobroConfirmado.tsx` in full.

- [ ] **Step 2: Add item lines section after the ticket header and before IVA breakdown**

Locate the block `{/* IVA breakdown — shown when cobro is available */}` (around line 158). Add a new section ABOVE it, still inside the `{cobro !== null && (...)}` block:

```tsx
{/* Detalle de ítems — shown when cobro has item breakdown (RD 1619/2012) */}
{cobro !== null && cobro.detalleItems !== null && cobro.detalleItems !== undefined && cobro.detalleItems.length > 0 && (
  <>
    <div className="h-px bg-[#2e3347]" />
    <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">Detalle</p>
    {cobro.detalleItems.map((item, i) => (
      <div key={i} className="flex justify-between text-xs">
        <span className="text-[#6b7280]">{item.cantidad}× {item.nombre}</span>
        <span>{fmt(item.precioUnitarioCents * item.cantidad)}</span>
      </div>
    ))}
  </>
)}
```

The full context where this goes (inside the `<div className="w-full bg-[#22263a] ...">`):

```tsx
{/* IVA breakdown — shown when cobro is available */}
{cobro !== null && (
  <>
    {/* Detalle de ítems */}
    {cobro.detalleItems !== null && cobro.detalleItems !== undefined && cobro.detalleItems.length > 0 && (
      <>
        <div className="h-px bg-[#2e3347]" />
        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">Detalle</p>
        {cobro.detalleItems.map((item, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-[#6b7280]">{item.cantidad}× {item.nombre}</span>
            <span>{fmt(item.precioUnitarioCents * item.cantidad)}</span>
          </div>
        ))}
      </>
    )}
    <div className="h-px bg-[#2e3347]" />
    <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">Desglose {tipoImpuesto.toUpperCase()}</p>
    ... (rest of IVA breakdown unchanged)
  </>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tpv/cobro/CobroConfirmado.tsx
git commit -m "feat(tpv): show detalle_items in CobroConfirmado ticket (RD 1619/2012)"
```

---

## Task 12: Legal Compliance Doc Update

**Files:**
- Modify: `docs/tpv-legal-compliance.md`

- [ ] **Step 1: Read the current file**

Read `docs/tpv-legal-compliance.md` in full.

- [ ] **Step 2: Mark items as completed in Section 3**

In Section 3 "Contenido obligatorio del ticket (RD 1619/2012)", update:

```markdown
- [x] **Desglose de ítems**: nombre del producto, cantidad, precio unitario. `detalle_items JSONB` en `tpv_cobros`. Auto-populated server-side desde `pedidos.detalle_pedido` en cobros de mesa. Mostrado en `CobroConfirmado` (20260714).
```

Also mark Informe Z as new section or add to section 3:

```markdown
- [x] **Informe Z de cierre de turno**: número secuencial `numero_z` asignado en trigger BEFORE UPDATE al cerrar. Endpoint `GET /api/tpv/turno/[id]/informe-z`. Modal `InformeZModal` con auto-impresión vía `window.print()` (20260714).
```

- [ ] **Step 3: Add version 1.5 to the history table**

```markdown
| 1.5     | 2026-07-14 | Informe Z (numero_z, endpoint, modal con auto-print); desglose de ítems en ticket (detalle_items JSONB, auto-populado desde pedidos, visible en CobroConfirmado) |
```

- [ ] **Step 4: Commit**

```bash
git add docs/tpv-legal-compliance.md
git commit -m "docs(tpv): mark Informe Z and detalle_items as completed in legal compliance doc"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Task |
|---|---|
| 2.1 DB `numero_z` trigger | Task 1 |
| 2.2 `InformeZData` type | Task 2 |
| 2.3 `getInformeZ` repository | Tasks 3 + 4 |
| 2.4 `GET /api/tpv/turno/[id]/informe-z` | Task 8 |
| 2.5 `TurnoCerrarForm` informe-z step | Task 10 |
| 2.5 `InformeZModal` with auto-print | Task 9 |
| 3.1 `detalle_items` column + trigger | Task 1 |
| 3.2 `TpvDetalleItem` type | Task 2 |
| 3.3 Mesa cobro — server auto-populates | Task 6 |
| 3.4 Use case passes through | Task 5 |
| 3.5 `CobroConfirmado` item lines | Task 11 |
| Rectificar inherits detalle_items | Task 7 |
| Legal doc update | Task 12 |

### Type Consistency Check

- `TpvDetalleItem` defined in Task 2 → used in Tasks 4, 5, 6, 7, 9, 11 ✓
- `InformeZData` defined in Task 2 → used in Tasks 3, 4, 8, 9, 10 ✓
- `crearCobroCompleto` receives `detalleItems?: TpvDetalleItem[]` (Task 2) → inserts `detalle_items` (Task 4) → returned in `TpvCobro.detalleItems` (Task 4) → displayed in `CobroConfirmado` (Task 11) ✓
- `getInformeZ` interface (Task 3) matches implementation (Task 4) ✓

### No Placeholders

No TBD, TODO, or "handle edge cases" patterns found. All steps contain complete code.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-14-informe-z-detalle-items.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
