# TPV Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir dashboard de analítica en `/tpv/analytics` con selector de período, KPIs, gráfico por hora, top productos e historial de turnos; más configuración IVA/IGIC por empresa con label dinámico en todo el TPV.

**Architecture:** Un único endpoint `GET /api/tpv/analytics?desde=&hasta=` ejecuta 4 queries SQL en `supabase-tpv.repository.ts` y devuelve un objeto `TpvAnalytics`. El Server Component `/tpv/analytics/page.tsx` hace el fetch inicial (hoy) y pasa los datos a `AnalyticsClient.tsx` (Client Component) que gestiona el selector de período. La configuración IVA/IGIC vive en `empresas.tipo_impuesto` y se propaga como prop desde SSR a todos los componentes TPV.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service_role client), Recharts (lazy-loaded con `dynamic()`), Tailwind v4, Zod, Clean Architecture (Route → Repository).

> **Note:** No hay test runner configurado en el proyecto. La verificación se hace con `pnpm lint` al final de cada tarea.

---

## Task 1: Migración DB — tipo_impuesto y porcentaje_impuesto en empresas

**Files:**
- Create: `supabase/migrations/20260703000004_empresas_tipo_impuesto.sql`

- [ ] **Crear migración SQL**

```sql
-- supabase/migrations/20260703000004_empresas_tipo_impuesto.sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS tipo_impuesto       TEXT         NOT NULL DEFAULT 'iva'
    CHECK (tipo_impuesto IN ('iva', 'igic')),
  ADD COLUMN IF NOT EXISTS porcentaje_impuesto  NUMERIC(5,2) NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.empresas.tipo_impuesto IS
  'Tipo de impuesto aplicable: iva (peninsular, 10%) o igic (Canarias, 7%)';
COMMENT ON COLUMN public.empresas.porcentaje_impuesto IS
  'Porcentaje del impuesto (configurable; defecto 10 para IVA, 7 para IGIC)';
```

- [ ] **Aplicar migración en Supabase**

Desde el dashboard de Supabase → SQL Editor, ejecutar el contenido del archivo.
O via CLI: `supabase db push` si está configurado localmente.

Verificar con: `SELECT tipo_impuesto, porcentaje_impuesto FROM empresas LIMIT 3;` — debe devolver `iva` y `10` para todas las filas existentes.

- [ ] **Commit**

```bash
git add supabase/migrations/20260703000004_empresas_tipo_impuesto.sql
git commit -m "feat(db): add tipo_impuesto and porcentaje_impuesto to empresas"
```

---

## Task 2: Tipos de dominio

**Files:**
- Modify: `src/core/domain/entities/tpv-types.ts`
- Modify: `src/core/domain/entities/types.ts`

- [ ] **Añadir tipos TPV Analytics a tpv-types.ts**

Añadir al final de `src/core/domain/entities/tpv-types.ts`:

```typescript
export type TipoImpuesto = 'iva' | 'igic';

export interface TpvTurnoResumen {
  id: string;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string | null;
  totalCents: number;
  numCobros: number;
  activo: boolean;
}

export interface TpvAnalytics {
  totalFacturadoCents: number;
  numCobros: number;
  ticketMedioCents: number;
  totalIvaCents: number;
  baseImponibleCents: number;
  totalPropinaCents: number;
  splitEfectivoCents: number;
  splitTarjetaCents: number;
  ventasPorHora: number[]; // 24 posiciones, índice = hora del día (0-23), zona Europe/Madrid
  topProductos: { nombre: string; cantidad: number }[];
  historialTurnos: TpvTurnoResumen[];
  numTurnos: number;
  duracionMediaMinutos: number | null;
}

export interface GetAnalyticsParams {
  empresaId: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}
```

- [ ] **Añadir campos IVA/IGIC a Empresa en types.ts**

En `src/core/domain/entities/types.ts`, dentro de `export interface Empresa`, añadir después de `nif?: string | null;`:

```typescript
  tipoImpuesto?: 'iva' | 'igic';
  porcentajeImpuesto?: number;
```

- [ ] **Commit**

```bash
git add src/core/domain/entities/tpv-types.ts src/core/domain/entities/types.ts
git commit -m "feat(types): add TpvAnalytics, TipoImpuesto, GetAnalyticsParams types"
```

---

## Task 3: Interfaz e implementación del repositorio

**Files:**
- Modify: `src/core/domain/repositories/ITpvRepository.ts`
- Modify: `src/core/infrastructure/repositories/supabase-tpv.repository.ts`

- [ ] **Añadir getAnalytics a ITpvRepository**

En `src/core/domain/repositories/ITpvRepository.ts`, añadir el import y el método:

```typescript
import { Result } from '@/core/domain/entities/types';
import {
  TpvTurno, TpvCobroPayload, TpvTurnoStats, TpvCobro,
  TpvCobroCompletoPayload, TpvAnalytics, GetAnalyticsParams,
} from '@/core/domain/entities/tpv-types';

export interface ITpvRepository {
  findTurnoActivo(empresaId: string): Promise<Result<TpvTurno | null>>;
  abrirTurno(params: {
    empresaId: string;
    userId: string;
    operadorNombre: string;
    efectivoAperturaCents: number;
  }): Promise<Result<TpvTurno>>;
  cerrarTurno(params: {
    turnoId: string;
    efectivoCierreCents: number;
    diferenciaCents: number;
  }): Promise<Result<void>>;
  registrarCobro(payload: TpvCobroPayload): Promise<Result<void>>;
  crearCobroCompleto(payload: TpvCobroCompletoPayload): Promise<Result<TpvCobro>>;
  getTurnoStats(turnoId: string): Promise<Result<TpvTurnoStats>>;
  getAnalytics(params: GetAnalyticsParams): Promise<Result<TpvAnalytics>>;
}
```

- [ ] **Implementar getAnalytics en SupabaseTpvRepository**

Añadir el método al final de la clase en `src/core/infrastructure/repositories/supabase-tpv.repository.ts`, antes del cierre `}` de la clase. Requiere añadir el import de los nuevos tipos al principio del archivo:

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
} from '@/core/domain/entities/tpv-types';
```

Método a añadir dentro de la clase:

```typescript
  async getAnalytics(params: GetAnalyticsParams): Promise<Result<TpvAnalytics>> {
    try {
      const supabase = getSupabaseClient();
      const { empresaId, desde, hasta } = params;

      // Query 1: KPIs de cobros (excluye rectificativos)
      const { data: kpiData, error: kpiErr } = await supabase.rpc('tpv_analytics_kpis', {
        p_empresa_id: empresaId,
        p_desde: desde,
        p_hasta: hasta,
      });

      if (kpiErr) {
        return { success: false, error: await logger.logFromCatch(kpiErr, 'repository', 'getAnalytics/kpis') };
      }

      const kpi = (kpiData as Record<string, unknown>[] | null)?.[0] ?? {};

      // Query 2: ventas por hora
      const { data: horasData, error: horasErr } = await supabase.rpc('tpv_analytics_por_hora', {
        p_empresa_id: empresaId,
        p_desde: desde,
        p_hasta: hasta,
      });

      if (horasErr) {
        return { success: false, error: await logger.logFromCatch(horasErr, 'repository', 'getAnalytics/horas') };
      }

      const ventasPorHora = Array(24).fill(0) as number[];
      for (const row of (horasData as { hora: number; total: number }[] | null) ?? []) {
        ventasPorHora[row.hora] = Number(row.total);
      }

      // Query 3: historial de turnos
      const { data: turnosData, error: turnosErr } = await supabase
        .from('tpv_turnos')
        .select('id, operador_nombre, apertura_at, cierre_at, total_efectivo_cents, total_tarjeta_cents')
        .eq('empresa_id', empresaId)
        .gte('apertura_at', desde)
        .lte('apertura_at', `${hasta}T23:59:59Z`)
        .order('apertura_at', { ascending: false });

      if (turnosErr) {
        return { success: false, error: await logger.logFromCatch(turnosErr, 'repository', 'getAnalytics/turnos') };
      }

      const turnoIds = ((turnosData ?? []) as Record<string, unknown>[]).map(t => t.id as string);

      // Query 3b: cobros por turno para calcular numCobros por turno
      const cobrosPorTurno: Record<string, number> = {};
      if (turnoIds.length > 0) {
        const { data: conteos } = await supabase
          .from('tpv_cobros')
          .select('turno_id')
          .in('turno_id', turnoIds)
          .is('rectifica_cobro_id', null);

        for (const c of (conteos ?? []) as { turno_id: string }[]) {
          cobrosPorTurno[c.turno_id] = (cobrosPorTurno[c.turno_id] ?? 0) + 1;
        }
      }

      const historialTurnos: TpvTurnoResumen[] = ((turnosData ?? []) as Record<string, unknown>[]).map(t => ({
        id: t.id as string,
        operadorNombre: t.operador_nombre as string,
        aperturaAt: t.apertura_at as string,
        cierreAt: t.cierre_at as string | null,
        totalCents: (Number(t.total_efectivo_cents) + Number(t.total_tarjeta_cents)),
        numCobros: cobrosPorTurno[t.id as string] ?? 0,
        activo: t.cierre_at === null,
      }));

      // Query 4: top productos (JSONB)
      const { data: topData, error: topErr } = await supabase.rpc('tpv_analytics_top_productos', {
        p_empresa_id: empresaId,
        p_desde: desde,
        p_hasta: hasta,
      });

      if (topErr) {
        return { success: false, error: await logger.logFromCatch(topErr, 'repository', 'getAnalytics/top') };
      }

      const numCobros = Number(kpi.num_cobros ?? 0);
      const totalFacturadoCents = Number(kpi.total_facturado ?? 0);

      return {
        success: true,
        data: {
          totalFacturadoCents,
          numCobros,
          ticketMedioCents: numCobros > 0 ? Math.round(totalFacturadoCents / numCobros) : 0,
          totalIvaCents: Number(kpi.total_iva ?? 0),
          baseImponibleCents: Number(kpi.base_imponible ?? 0),
          totalPropinaCents: Number(kpi.total_propina ?? 0),
          splitEfectivoCents: Number(kpi.efectivo ?? 0),
          splitTarjetaCents: Number(kpi.tarjeta ?? 0),
          ventasPorHora,
          topProductos: ((topData as { nombre: string; cantidad: number }[] | null) ?? []),
          historialTurnos,
          numTurnos: historialTurnos.length,
          duracionMediaMinutos: historialTurnos.filter(t => !t.activo).length > 0
            ? Math.round(
                historialTurnos
                  .filter(t => !t.activo)
                  .reduce((sum, t) => {
                    const ms = new Date(t.cierreAt!).getTime() - new Date(t.aperturaAt).getTime();
                    return sum + ms / 60000;
                  }, 0) / historialTurnos.filter(t => !t.activo).length
              )
            : null,
        },
      };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'getAnalytics') };
    }
  }
```

- [ ] **Commit**

```bash
git add src/core/domain/repositories/ITpvRepository.ts \
        src/core/infrastructure/repositories/supabase-tpv.repository.ts
git commit -m "feat(repo): implement getAnalytics in SupabaseTpvRepository"
```

---

## Task 4: RPCs de Supabase para las queries de analítica

**Files:**
- Create: `supabase/migrations/20260703000005_tpv_analytics_rpcs.sql`

Las queries de analítica usan SQL avanzado (JSONB, AT TIME ZONE, CASE WHEN) que el cliente Supabase JS no soporta directamente. Se encapsulan como funciones RPC con `SECURITY DEFINER`.

- [ ] **Crear migración con las 3 RPCs**

```sql
-- supabase/migrations/20260703000005_tpv_analytics_rpcs.sql

-- ─── RPC 1: KPIs de cobros ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tpv_analytics_kpis(
  p_empresa_id UUID,
  p_desde      DATE,
  p_hasta      DATE
)
RETURNS TABLE (
  total_facturado BIGINT,
  num_cobros      BIGINT,
  total_iva       BIGINT,
  base_imponible  BIGINT,
  total_propina   BIGINT,
  efectivo        BIGINT,
  tarjeta         BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(SUM(importe_cobrado_cents), 0)::BIGINT,
    COUNT(*)::BIGINT,
    COALESCE(SUM(iva_cents), 0)::BIGINT,
    COALESCE(SUM(base_imponible_cents), 0)::BIGINT,
    COALESCE(SUM(propina_cents), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN importe_cobrado_cents ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metodo_pago = 'tarjeta'  THEN importe_cobrado_cents ELSE 0 END), 0)::BIGINT
  FROM public.tpv_cobros
  WHERE empresa_id          = p_empresa_id
    AND cobrado_at         >= p_desde::timestamptz
    AND cobrado_at          < (p_hasta + interval '1 day')::timestamptz
    AND rectifica_cobro_id IS NULL;
$$;

GRANT EXECUTE ON FUNCTION tpv_analytics_kpis(UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION tpv_analytics_kpis(UUID, DATE, DATE) TO authenticated;

-- ─── RPC 2: ventas por hora ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tpv_analytics_por_hora(
  p_empresa_id UUID,
  p_desde      DATE,
  p_hasta      DATE
)
RETURNS TABLE (hora INT, total BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    EXTRACT(hour FROM cobrado_at AT TIME ZONE 'Europe/Madrid')::INT AS hora,
    COALESCE(SUM(importe_cobrado_cents), 0)::BIGINT                 AS total
  FROM public.tpv_cobros
  WHERE empresa_id          = p_empresa_id
    AND cobrado_at         >= p_desde::timestamptz
    AND cobrado_at          < (p_hasta + interval '1 day')::timestamptz
    AND rectifica_cobro_id IS NULL
  GROUP BY hora
  ORDER BY hora;
$$;

GRANT EXECUTE ON FUNCTION tpv_analytics_por_hora(UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION tpv_analytics_por_hora(UUID, DATE, DATE) TO authenticated;

-- ─── RPC 3: top productos ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tpv_analytics_top_productos(
  p_empresa_id UUID,
  p_desde      DATE,
  p_hasta      DATE
)
RETURNS TABLE (nombre TEXT, cantidad BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    elem->>'nombre'              AS nombre,
    SUM((elem->>'cantidad')::int)::BIGINT AS cantidad
  FROM public.pedidos,
       jsonb_array_elements(detalle_pedido) AS elem
  WHERE empresa_id  = p_empresa_id
    AND created_at >= p_desde::timestamptz
    AND created_at  < (p_hasta + interval '1 day')::timestamptz
    AND estado     != 'cancelado'
  GROUP BY nombre
  ORDER BY cantidad DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION tpv_analytics_top_productos(UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION tpv_analytics_top_productos(UUID, DATE, DATE) TO authenticated;
```

- [ ] **Aplicar migración**

Ejecutar en Supabase SQL Editor. Verificar:
```sql
SELECT * FROM tpv_analytics_kpis('<tu-empresa-id>', CURRENT_DATE, CURRENT_DATE);
```
Debe devolver una fila con ceros si no hay cobros hoy, o con los totales reales.

- [ ] **Commit**

```bash
git add supabase/migrations/20260703000005_tpv_analytics_rpcs.sql
git commit -m "feat(db): add tpv analytics RPCs (kpis, por_hora, top_productos)"
```

---

## Task 5: Endpoint GET /api/tpv/analytics

**Files:**
- Create: `src/app/api/tpv/analytics/route.ts`

- [ ] **Crear el endpoint**

```typescript
// src/app/api/tpv/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';

const querySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido: YYYY-MM-DD'),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido: YYYY-MM-DD'),
}).refine(
  ({ desde, hasta }) => {
    const d = new Date(desde);
    const h = new Date(hasta);
    const diffDays = (h.getTime() - d.getTime()) / 86_400_000;
    return diffDays >= 0 && diffDays <= 365;
  },
  { message: 'El rango no puede superar 365 días ni ser negativo' }
);

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { searchParams } = new URL(req.url);
  const raw = {
    desde: searchParams.get('desde') ?? '',
    hasta: searchParams.get('hasta') ?? '',
  };

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const repo = new SupabaseTpvRepository();
  const result = await repo.getAnalytics({
    empresaId,
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json(result.data);
}
```

- [ ] **Verificar que el endpoint responde**

Con el servidor corriendo (`pnpm dev`), hacer:
```
GET http://localhost:3000/api/tpv/analytics?desde=2026-07-01&hasta=2026-07-03
```
Con un admin logueado, debe devolver 200 con el objeto `TpvAnalytics`.

- [ ] **Commit**

```bash
git add src/app/api/tpv/analytics/route.ts
git commit -m "feat(api): add GET /api/tpv/analytics endpoint"
```

---

## Task 6: Configuración IVA/IGIC en Admin

**Files:**
- Modify: `src/core/domain/repositories/IEmpresaRepository.ts`
- Modify: `src/core/application/dtos/empresa.dto.ts`
- Modify: `src/core/infrastructure/database/supabase-empresa.repository.ts`
- Modify: `src/app/api/admin/empresa/route.ts`
- Modify: `src/components/admin/empresa-datos-form.tsx`
- Modify: `src/components/admin/configuracion-page-client.tsx`
- Modify: `src/app/admin/(protected)/configuracion/page.tsx`

- [ ] **IEmpresaRepository.ts — añadir campos a UpdateEmpresaData**

En `src/core/domain/repositories/IEmpresaRepository.ts`, dentro de `export interface UpdateEmpresaData`, añadir después de `nif?: string | null;`:

```typescript
  tipo_impuesto?: 'iva' | 'igic';
  porcentaje_impuesto?: number;
```

- [ ] **empresa.dto.ts — añadir validación Zod**

En `src/core/application/dtos/empresa.dto.ts`, añadir dentro del schema (después de `nif`):

```typescript
  tipo_impuesto: z.enum(['iva', 'igic']).optional(),
  porcentaje_impuesto: z.number().min(0).max(30).optional(),
```

- [ ] **supabase-empresa.repository.ts — SELECT y update**

En `src/core/infrastructure/database/supabase-empresa.repository.ts`, en el método `getById`, añadir `tipo_impuesto, porcentaje_impuesto` al string de SELECT junto a `nif`.

En el método `update`, añadir después del bloque que maneja `nif`:

```typescript
if (data.tipo_impuesto !== undefined) updatePayload.tipo_impuesto = data.tipo_impuesto;
if (data.porcentaje_impuesto !== undefined) updatePayload.porcentaje_impuesto = data.porcentaje_impuesto;
```

También en el mapper que convierte snake_case → camelCase, añadir:
```typescript
tipoImpuesto: (row.tipo_impuesto as 'iva' | 'igic' | undefined) ?? 'iva',
porcentajeImpuesto: (row.porcentaje_impuesto as number | undefined) ?? 10,
```

- [ ] **api/admin/empresa/route.ts — exponer en GET**

En el handler GET, dentro del objeto de respuesta donde ya se devuelve `nif`, añadir:

```typescript
tipoImpuesto: empresa.tipoImpuesto ?? 'iva',
porcentajeImpuesto: empresa.porcentajeImpuesto ?? 10,
```

- [ ] **configuracion-page-client.tsx — extender EmpresaDatos**

En `src/components/admin/configuracion-page-client.tsx`, en la interfaz `EmpresaDatos` (o el tipo equivalente), añadir:

```typescript
  tipoImpuesto: 'iva' | 'igic';
  porcentajeImpuesto: number;
```

- [ ] **configuracion/page.tsx — pasar nuevos campos**

En `src/app/admin/(protected)/configuracion/page.tsx`, donde se construye `empresaDatos`, añadir:

```typescript
tipoImpuesto: (empresaData?.tipoImpuesto as 'iva' | 'igic' | undefined) ?? 'iva',
porcentajeImpuesto: empresaData?.porcentajeImpuesto ?? 10,
```

- [ ] **empresa-datos-form.tsx — añadir dropdown IVA/IGIC**

En `src/components/admin/empresa-datos-form.tsx`, en la interfaz `EmpresaDatosFormProps` (o el tipo de `formData`), añadir:

```typescript
  tipoImpuesto: 'iva' | 'igic';
  porcentajeImpuesto: number;
```

Añadir el bloque de UI después del campo NIF existente:

```tsx
{/* Tipo de impuesto */}
<div className="space-y-2">
  <label htmlFor="tipo_impuesto" className="text-sm font-medium text-foreground flex items-center gap-2">
    <Receipt className="h-4 w-4 text-muted-foreground" />
    Tipo de impuesto
  </label>
  <select
    id="tipo_impuesto"
    name="tipo_impuesto"
    value={formData.tipoImpuesto}
    onChange={(e) => {
      const tipo = e.target.value as 'iva' | 'igic';
      handleChange('tipoImpuesto', tipo);
      handleChange('porcentajeImpuesto', tipo === 'igic' ? 7 : 10);
    }}
    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
  >
    <option value="iva">IVA (Península y Baleares)</option>
    <option value="igic">IGIC (Canarias)</option>
  </select>
</div>
<div className="space-y-2">
  <label htmlFor="porcentaje_impuesto" className="text-sm font-medium text-foreground">
    Porcentaje ({formData.tipoImpuesto === 'igic' ? 'IGIC' : 'IVA'} %)
  </label>
  <input
    type="number"
    id="porcentaje_impuesto"
    name="porcentaje_impuesto"
    min={0}
    max={30}
    step={0.1}
    value={formData.porcentajeImpuesto}
    onChange={(e) => handleChange('porcentajeImpuesto', parseFloat(e.target.value))}
    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
  />
  <span className="text-xs text-muted-foreground">
    10% para IVA estándar restauración · 7% para IGIC general
  </span>
</div>
```

Asegurarse de que `Receipt` está importado de `lucide-react`. Si ya existe otro icono de factura, usar el mismo.

Asegurarse de que el submit del formulario incluye `tipo_impuesto` y `porcentaje_impuesto` en el payload enviado al endpoint PUT.

- [ ] **Verificar lint**

```bash
pnpm lint
```

- [ ] **Commit**

```bash
git add \
  src/core/domain/repositories/IEmpresaRepository.ts \
  src/core/application/dtos/empresa.dto.ts \
  src/core/infrastructure/database/supabase-empresa.repository.ts \
  src/app/api/admin/empresa/route.ts \
  src/components/admin/empresa-datos-form.tsx \
  src/components/admin/configuracion-page-client.tsx \
  src/app/admin/(protected)/configuracion/page.tsx
git commit -m "feat(admin): add IVA/IGIC config (tipo_impuesto, porcentaje_impuesto) to empresa settings"
```

---

## Task 7: Propagación del label IVA/IGIC a componentes TPV

**Files:**
- Modify: `src/app/tpv/cobro/[sesionId]/page.tsx`
- Modify: `src/components/tpv/cobro/CobroConfirmado.tsx`
- Modify: `src/app/tpv/historial/page.tsx`

- [ ] **cobro/[sesionId]/page.tsx — query tipo_impuesto**

En `src/app/tpv/cobro/[sesionId]/page.tsx`, en la query de `empresas`, cambiar el SELECT de `'nif'` a `'nif, tipo_impuesto, porcentaje_impuesto'`:

```typescript
supabase
  .from('empresas')
  .select('nif, tipo_impuesto, porcentaje_impuesto')
  .eq('id', admin.empresaId)
  .maybeSingle(),
```

Extraer los valores del resultado:

```typescript
const empresaRow = empresaRes.data as {
  nif: string | null;
  tipo_impuesto: string | null;
  porcentaje_impuesto: number | null;
} | null;

const nif = empresaRow?.nif ?? null;
const tipoImpuesto = (empresaRow?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva';
```

Pasar `tipoImpuesto` a `CobroFlow`:

```tsx
<CobroFlow
  sesionId={sesionId}
  turnoId={turnoId}
  total={sesionData.total}
  propinaCents={sesionData.propina_cents}
  mesaNumero={sesionData.mesas?.numero ?? null}
  empresaNif={nif}
  tipoImpuesto={tipoImpuesto}
/>
```

- [ ] **CobroFlow — pasar tipoImpuesto hacia CobroConfirmado**

En `src/components/tpv/cobro/CobroFlow.tsx`, añadir `tipoImpuesto: 'iva' | 'igic'` a la interfaz de Props y pasarlo a `<CobroConfirmado>`.

- [ ] **CobroConfirmado.tsx — label dinámico**

En `src/components/tpv/cobro/CobroConfirmado.tsx`, añadir `tipoImpuesto: 'iva' | 'igic'` a Props.

Reemplazar las ocurrencias de `"IVA"` hardcodeado con `{tipoImpuesto.toUpperCase()}`:

```tsx
// Antes:
<p className="...">Desglose IVA</p>
<span>Base imponible ({cobro.ivaPorcentaje}% IVA)</span>
<span>IVA {cobro.ivaPorcentaje}%</span>

// Después:
<p className="...">Desglose {tipoImpuesto.toUpperCase()}</p>
<span>Base imponible ({cobro.ivaPorcentaje}% {tipoImpuesto.toUpperCase()})</span>
<span>{tipoImpuesto.toUpperCase()} {cobro.ivaPorcentaje}%</span>
```

- [ ] **historial/page.tsx — query tipo_impuesto y pasarlo**

En `src/app/tpv/historial/page.tsx`, añadir query de `tipo_impuesto` al cargar la empresa:

```typescript
const { data: empresaRow } = await supabase
  .from('empresas')
  .select('tipo_impuesto')
  .eq('id', empresaId)
  .maybeSingle();

const tipoImpuesto = ((empresaRow as { tipo_impuesto: string } | null)?.tipo_impuesto as 'iva' | 'igic') ?? 'iva';
```

Pasar `tipoImpuesto` a `<HistorialClient>`:

```tsx
<HistorialClient
  pedidos={rows}
  cobros={cobros}
  turnoAperturaAt={turno.aperturaAt}
  tipoImpuesto={tipoImpuesto}
/>
```

- [ ] **Verificar lint**

```bash
pnpm lint
```

- [ ] **Commit**

```bash
git add \
  src/app/tpv/cobro/\[sesionId\]/page.tsx \
  src/components/tpv/cobro/CobroFlow.tsx \
  src/components/tpv/cobro/CobroConfirmado.tsx \
  src/app/tpv/historial/page.tsx
git commit -m "feat(tpv): propagate tipoImpuesto (IVA/IGIC) label to cobro and historial"
```

---

## Task 8: KPIs inline en HistorialClient

**Files:**
- Modify: `src/components/tpv/HistorialClient.tsx`

- [ ] **Añadir prop tipoImpuesto y calcular KPIs desde cobros existentes**

En `src/components/tpv/HistorialClient.tsx`:

1. Añadir `tipoImpuesto: 'iva' | 'igic'` a la interfaz `Props`.

2. Después de las variables `totalFacturado` y `totalCobrado` existentes, añadir:

```typescript
const cobrosValidos = cobros.filter(c => c.rectificaCobroId === null);
const ticketMedioCents = cobrosValidos.length > 0
  ? Math.round(cobrosValidos.reduce((s, c) => s + c.importeCobradoCents, 0) / cobrosValidos.length)
  : 0;

const totalIvaCents = cobrosValidos.reduce((s, c) => s + c.ivaCents, 0);
const totalEfectivoCents = cobrosValidos
  .filter(c => c.metodoPago === 'efectivo')
  .reduce((s, c) => s + c.importeCobradoCents, 0);
const totalTarjetaCents = cobrosValidos
  .filter(c => c.metodoPago === 'tarjeta')
  .reduce((s, c) => s + c.importeCobradoCents, 0);
const totalBruto = totalEfectivoCents + totalTarjetaCents;
const pctEfectivo = totalBruto > 0 ? Math.round((totalEfectivoCents / totalBruto) * 100) : 0;
```

3. Añadir 3 KPI cards en la sección de estadísticas del header, junto a los existentes (Pedidos, Facturado, Cobrado):

```tsx
<div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 text-center">
  <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">Ticket ∅</p>
  <p className="text-xl font-bold text-[#4f72ff]">{fmt(ticketMedioCents / 100)}</p>
</div>
<div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 text-center">
  <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">{tipoImpuesto.toUpperCase()}</p>
  <p className="text-xl font-bold text-[#f59e0b]">{fmt(totalIvaCents / 100)}</p>
</div>
<div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 text-center min-w-[90px]">
  <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">Efectivo</p>
  <p className="text-xl font-bold text-[#22c55e]">{pctEfectivo}%</p>
  <p className="text-[10px] text-[#6b7280]">{100 - pctEfectivo}% tarjeta</p>
</div>
```

- [ ] **Verificar lint**

```bash
pnpm lint
```

- [ ] **Commit**

```bash
git add src/components/tpv/HistorialClient.tsx
git commit -m "feat(tpv): add ticket medio, IVA/IGIC and payment split KPIs to HistorialClient"
```

---

## Task 9: AnalyticsClient — componente cliente

**Files:**
- Create: `src/components/tpv/AnalyticsClient.tsx`

- [ ] **Crear AnalyticsClient.tsx**

```typescript
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { TpvAnalytics, TipoImpuesto } from '@/core/domain/entities/tpv-types';

const TpvBarChart = dynamic(
  () => import('@/components/tpv/TpvBarChart').then(m => m.TpvBarChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-[#6b7280]" />
      </div>
    ),
  }
);

type Periodo = 'hoy' | 'semana' | 'mes' | 'custom';

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function calcDesdeHasta(periodo: Periodo, customDesde: string, customHasta: string): [string, string] {
  const today = new Date();
  if (periodo === 'hoy') return [toDateStr(today), toDateStr(today)];
  if (periodo === 'semana') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return [toDateStr(from), toDateStr(today)];
  }
  if (periodo === 'mes') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return [toDateStr(from), toDateStr(today)];
  }
  return [customDesde, customHasta];
}

interface Props {
  readonly initialData: TpvAnalytics;
  readonly tipoImpuesto: TipoImpuesto;
}

export function AnalyticsClient({ initialData, tipoImpuesto }: Props) {
  const today = toDateStr(new Date());
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [customDesde, setCustomDesde] = useState(today);
  const [customHasta, setCustomHasta] = useState(today);
  const [data, setData] = useState<TpvAnalytics>(initialData);
  const [loading, setLoading] = useState(false);
  const impLabel = tipoImpuesto.toUpperCase();

  async function fetchData(p: Periodo, cd: string, ch: string) {
    const [desde, hasta] = calcDesdeHasta(p, cd, ch);
    setLoading(true);
    try {
      const res = await fetch(`/api/tpv/analytics?desde=${desde}&hasta=${hasta}`);
      if (res.ok) setData(await res.json() as TpvAnalytics);
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodo(p: Periodo) {
    setPeriodo(p);
    if (p !== 'custom') void fetchData(p, customDesde, customHasta);
  }

  function handleCustomApply() {
    void fetchData('custom', customDesde, customHasta);
  }

  const totalBruto = data.splitEfectivoCents + data.splitTarjetaCents;
  const pctEfectivo = totalBruto > 0 ? Math.round((data.splitEfectivoCents / totalBruto) * 100) : 0;

  // Solo mostrar horas con actividad ±1h de margen
  const activeHours = data.ventasPorHora
    .map((v, i) => ({ hora: i, total: v }))
    .filter(h => h.total > 0);
  const minHora = activeHours.length > 0 ? Math.max(0, Math.min(...activeHours.map(h => h.hora)) - 1) : 8;
  const maxHora = activeHours.length > 0 ? Math.min(23, Math.max(...activeHours.map(h => h.hora)) + 1) : 22;
  const chartData = data.ventasPorHora
    .map((total, hora) => ({ hora: `${hora}h`, total: total / 100 }))
    .slice(minHora, maxHora + 1);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-[#e8eaf0]">Analítica TPV</h2>
            <p className="text-xs text-[#6b7280] mt-0.5">Rendimiento de caja por período</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />}
            <div className="flex gap-1 bg-[#1a1d27] border border-[#2e3347] rounded-xl p-1">
              {(['hoy', 'semana', 'mes', 'custom'] as Periodo[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePeriodo(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    periodo === p ? 'bg-[#4f72ff] text-white' : 'text-[#6b7280] hover:text-white'
                  }`}
                >
                  {p === 'semana' ? 'Semana' : p === 'custom' ? 'Custom' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom date inputs */}
        {periodo === 'custom' && (
          <div className="flex items-center gap-3 mb-6 bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3">
            <input
              type="date"
              value={customDesde}
              onChange={e => setCustomDesde(e.target.value)}
              className="bg-transparent text-sm text-[#e8eaf0] border border-[#2e3347] rounded-lg px-2 py-1"
            />
            <span className="text-[#6b7280] text-sm">→</span>
            <input
              type="date"
              value={customHasta}
              onChange={e => setCustomHasta(e.target.value)}
              className="bg-transparent text-sm text-[#e8eaf0] border border-[#2e3347] rounded-lg px-2 py-1"
            />
            <button
              type="button"
              onClick={handleCustomApply}
              className="ml-2 px-4 py-1.5 rounded-lg bg-[#4f72ff] text-white text-xs font-semibold"
            >
              Aplicar
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Facturado', value: fmt(data.totalFacturadoCents), sub: `${data.numCobros} cobros`, color: 'text-[#e8eaf0]' },
            { label: 'Ticket ∅', value: fmt(data.ticketMedioCents), sub: 'por cobro', color: 'text-[#4f72ff]' },
            { label: `${impLabel} total`, value: fmt(data.totalIvaCents), sub: `Base: ${fmt(data.baseImponibleCents)}`, color: 'text-[#f59e0b]' },
            { label: 'Propinas', value: fmt(data.totalPropinaCents), sub: `exento ${impLabel}`, color: 'text-[#e8eaf0]' },
            { label: 'Turnos', value: String(data.numTurnos), sub: data.duracionMediaMinutos !== null ? `∅ ${Math.floor(data.duracionMediaMinutos / 60)}h ${data.duracionMediaMinutos % 60}m` : '—', color: 'text-[#e8eaf0]' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3">
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] text-[#6b7280] mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Gráfico por hora + Split pago */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="col-span-2 bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Ventas por hora</p>
            <div className="h-40">
              {activeHours.length > 0
                ? <TpvBarChart data={chartData} />
                : <p className="text-center text-[#6b7280] text-sm py-12">Sin datos en este período</p>
              }
            </div>
          </div>
          <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Método de pago</p>
            <div className="flex flex-col gap-4">
              {[
                { label: 'Efectivo', cents: data.splitEfectivoCents, pct: pctEfectivo, color: '#22c55e' },
                { label: 'Tarjeta', cents: data.splitTarjetaCents, pct: 100 - pctEfectivo, color: '#4f72ff' },
              ].map(m => (
                <div key={m.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: m.color }}>{m.label}</span>
                    <span className="text-xs text-[#e8eaf0]">{fmt(m.cents)}</span>
                  </div>
                  <div className="bg-[#2e3347] rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                  </div>
                  <span className="text-[10px] text-[#6b7280]">{m.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top productos + Historial turnos */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Productos más vendidos</p>
            {data.topProductos.length === 0
              ? <p className="text-[#6b7280] text-sm">Sin datos</p>
              : (
                <div className="flex flex-col gap-2">
                  {data.topProductos.map((p, i) => (
                    <div key={p.nombre} className="flex items-center gap-3">
                      <span
                        className="text-[9px] font-bold w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{
                          background: i < 3 ? '#4f72ff' : '#2e3347',
                          color: i < 3 ? 'white' : '#6b7280',
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm text-[#c8cad4] flex-1 truncate">{p.nombre}</span>
                      <span className="text-xs text-[#6b7280] shrink-0">× {p.cantidad}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>

          <div className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#e8eaf0] mb-4">Turnos del período</p>
            {data.historialTurnos.length === 0
              ? <p className="text-[#6b7280] text-sm">Sin turnos</p>
              : (
                <div className="flex flex-col gap-2">
                  {data.historialTurnos.map(t => (
                    <div key={t.id} className="bg-[#22263a] rounded-lg px-3 py-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-[#e8eaf0]">{t.operadorNombre}</span>
                        {t.activo
                          ? <span className="text-[10px] text-[#4f72ff] font-bold">● En curso</span>
                          : <span className="text-sm font-bold text-[#22c55e]">{fmt(t.totalCents)}</span>
                        }
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-[#6b7280]">
                          {fmtTime(t.aperturaAt)}{t.cierreAt ? ` → ${fmtTime(t.cierreAt)}` : ''} · {fmtDate(t.aperturaAt)}
                        </span>
                        <span className="text-[10px] text-[#6b7280]">{t.numCobros} cobros</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add src/components/tpv/AnalyticsClient.tsx
git commit -m "feat(tpv): add AnalyticsClient with period selector, KPIs, charts and tables"
```

---

## Task 10: TpvBarChart — componente Recharts lazy

**Files:**
- Create: `src/components/tpv/TpvBarChart.tsx`

- [ ] **Crear TpvBarChart.tsx**

Este componente es el que se carga lazy desde `AnalyticsClient`. Importa Recharts directamente (no re-exporta todo como `AdminCharts`).

```typescript
'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface ChartRow {
  hora: string;
  total: number;
}

interface Props {
  readonly data: ChartRow[];
}

export function TpvBarChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" vertical={false} />
        <XAxis
          dataKey="hora"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}€`}
        />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8 }}
          labelStyle={{ color: '#e8eaf0', fontSize: 11 }}
          itemStyle={{ color: '#4f72ff', fontSize: 11 }}
          formatter={(v: number) => [`${v.toFixed(2)} €`, 'Ventas']}
        />
        <Bar dataKey="total" fill="#4f72ff" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Commit**

```bash
git add src/components/tpv/TpvBarChart.tsx
git commit -m "feat(tpv): add TpvBarChart Recharts component (lazy-loaded)"
```

---

## Task 11: Página /tpv/analytics (Server Component)

**Files:**
- Create: `src/app/tpv/analytics/page.tsx`

- [ ] **Crear page.tsx**

```typescript
// src/app/tpv/analytics/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { AnalyticsClient } from '@/components/tpv/AnalyticsClient';
import type { TipoImpuesto } from '@/core/domain/entities/tpv-types';

export const dynamic = 'force-dynamic';

export default async function TpvAnalyticsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);
  if (!admin || !admin.empresa) redirect('/admin/login');

  const empresaId = admin.empresa.id;
  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(empresaId);

  if (!turnoResult.success || !turnoResult.data) redirect('/tpv/turno/abrir');

  const today = new Date().toISOString().slice(0, 10);

  const [analyticsResult, empresaRes] = await Promise.all([
    repo.getAnalytics({ empresaId, desde: today, hasta: today }),
    getSupabaseClient()
      .from('empresas')
      .select('tipo_impuesto')
      .eq('id', empresaId)
      .maybeSingle(),
  ]);

  if (!analyticsResult.success) redirect('/tpv/mostrador');

  const tipoImpuesto = ((empresaRes.data as { tipo_impuesto: string } | null)?.tipo_impuesto as TipoImpuesto) ?? 'iva';

  return (
    <AnalyticsClient
      initialData={analyticsResult.data}
      tipoImpuesto={tipoImpuesto}
    />
  );
}
```

- [ ] **Verificar lint**

```bash
pnpm lint
```

- [ ] **Commit**

```bash
git add src/app/tpv/analytics/page.tsx
git commit -m "feat(tpv): add /tpv/analytics Server Component page"
```

---

## Task 12: Enlace Analítica en AccionesPanel

**Files:**
- Modify: `src/components/tpv/AccionesPanel.tsx`

- [ ] **Añadir enlace "Analítica" junto a "Conformidad legal"**

En `src/components/tpv/AccionesPanel.tsx`, en el grupo "Sistema" donde ya existe el botón de "Conformidad legal", añadir antes de él:

```tsx
<ActionButton label="Analítica" onClick={() => router.push('/tpv/analytics')} />
```

- [ ] **Verificar lint**

```bash
pnpm lint
```

- [ ] **Commit**

```bash
git add src/components/tpv/AccionesPanel.tsx
git commit -m "feat(tpv): add Analítica link to AccionesPanel"
```

---

## Task 13: Integración crearCobroCompleto con porcentaje de empresa

**Files:**
- Modify: `src/app/api/tpv/cobro/route.ts`
- Modify: `src/app/tpv/cobro/[sesionId]/page.tsx`

El endpoint de cobro actualmente usa `ivaPorcentaje: 10` como default hardcodeado en el payload. Debería usar el `porcentaje_impuesto` de la empresa.

- [ ] **cobro/[sesionId]/page.tsx — leer porcentaje_impuesto**

La query de empresas ya se actualizó en Task 7. Extraer también `porcentaje_impuesto`:

```typescript
const empresaRow = empresaRes.data as {
  nif: string | null;
  tipo_impuesto: string | null;
  porcentaje_impuesto: number | null;
} | null;

const nif = empresaRow?.nif ?? null;
const tipoImpuesto = (empresaRow?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva';
const porcentajeImpuesto = empresaRow?.porcentaje_impuesto ?? 10;
```

Pasar `porcentajeImpuesto` a `CobroFlow`:

```tsx
<CobroFlow
  sesionId={sesionId}
  turnoId={turnoId}
  total={sesionData.total}
  propinaCents={sesionData.propina_cents}
  mesaNumero={sesionData.mesas?.numero ?? null}
  empresaNif={nif}
  tipoImpuesto={tipoImpuesto}
  porcentajeImpuesto={porcentajeImpuesto}
/>
```

- [ ] **CobroFlow — pasar porcentajeImpuesto al fetch de cobro**

En `src/components/tpv/cobro/CobroFlow.tsx`, añadir `porcentajeImpuesto: number` a Props y enviarlo en el body del POST a `/api/tpv/cobro`:

```typescript
body: JSON.stringify({
  sesionId,
  turnoId,
  metodoPago,
  importeCobradoCents,
  propinaCents,
  ivaPorcentaje: porcentajeImpuesto,
}),
```

- [ ] **api/tpv/cobro/route.ts — aceptar ivaPorcentaje del body**

Verificar que el schema Zod del endpoint ya acepta `ivaPorcentaje` opcional. Si no, añadir:

```typescript
ivaPorcentaje: z.number().min(0).max(30).optional().default(10),
```

Y asegurarse de que se pasa a `crearCobroCompleto`:

```typescript
ivaPorcentaje: parsed.data.ivaPorcentaje,
```

- [ ] **Verificar lint**

```bash
pnpm lint
```

- [ ] **Commit**

```bash
git add \
  src/app/tpv/cobro/\[sesionId\]/page.tsx \
  src/components/tpv/cobro/CobroFlow.tsx \
  src/app/api/tpv/cobro/route.ts
git commit -m "feat(tpv): use empresa porcentaje_impuesto as default tax rate in cobro flow"
```

---

## Task 14: Verificación final

- [ ] **Ejecutar lint completo**

```bash
pnpm lint
```

Resolver cualquier error o warning. No avanzar con errores TS o SonarLint severity 8.

- [ ] **Verificar flujo completo manualmente**

1. Ir a `/admin/configuracion` → sección Empresa → debe aparecer dropdown IVA/IGIC con porcentaje editable. Cambiar a IGIC → porcentaje se auto-rellena a 7. Guardar.
2. Ir a `/tpv/cobro/[sesionId]` → completar un cobro → en `CobroConfirmado` el label debe decir "IGIC" en lugar de "IVA".
3. Ir a `/tpv/historial` → debe mostrar 3 KPIs nuevos (Ticket ∅, IGIC, Efectivo %).
4. Ir a `/tpv/analytics` (desde AccionesPanel → "Analítica") → debe mostrar los datos de hoy. Cambiar a "Semana" → datos se recargan. Probar "Custom" con rango de fechas.
5. Volver a IVA en configuración → verificar que los labels vuelven a "IVA".

- [ ] **Commit final**

```bash
git add -A
git commit -m "chore(tpv): final lint pass and cleanup"
```

---

## Resumen de archivos

| Archivo | Acción |
|---|---|
| `supabase/migrations/20260703000004_empresas_tipo_impuesto.sql` | Crear |
| `supabase/migrations/20260703000005_tpv_analytics_rpcs.sql` | Crear |
| `src/app/api/tpv/analytics/route.ts` | Crear |
| `src/app/tpv/analytics/page.tsx` | Crear |
| `src/components/tpv/AnalyticsClient.tsx` | Crear |
| `src/components/tpv/TpvBarChart.tsx` | Crear |
| `src/core/domain/entities/tpv-types.ts` | Modificar |
| `src/core/domain/entities/types.ts` | Modificar |
| `src/core/domain/repositories/ITpvRepository.ts` | Modificar |
| `src/core/domain/repositories/IEmpresaRepository.ts` | Modificar |
| `src/core/application/dtos/empresa.dto.ts` | Modificar |
| `src/core/infrastructure/repositories/supabase-tpv.repository.ts` | Modificar |
| `src/core/infrastructure/database/supabase-empresa.repository.ts` | Modificar |
| `src/app/api/admin/empresa/route.ts` | Modificar |
| `src/app/api/tpv/cobro/route.ts` | Modificar |
| `src/components/admin/empresa-datos-form.tsx` | Modificar |
| `src/components/admin/configuracion-page-client.tsx` | Modificar |
| `src/app/admin/(protected)/configuracion/page.tsx` | Modificar |
| `src/components/tpv/AccionesPanel.tsx` | Modificar |
| `src/components/tpv/HistorialClient.tsx` | Modificar |
| `src/app/tpv/historial/page.tsx` | Modificar |
| `src/app/tpv/cobro/[sesionId]/page.tsx` | Modificar |
| `src/components/tpv/cobro/CobroFlow.tsx` | Modificar |
| `src/components/tpv/cobro/CobroConfirmado.tsx` | Modificar |
