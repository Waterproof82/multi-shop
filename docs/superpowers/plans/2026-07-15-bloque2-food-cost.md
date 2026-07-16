# Bloque 2 — Food Cost Avanzado (CMP, Teórico/Real, Margen por Producto)

> **For agentic workers:** Use `sdd-apply` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar CMP (Coste Medio Ponderado), analytics de food cost teórico vs real, y análisis de margen por producto para restaurantes multi-tenant. Tres características: 2.1 Motor CMP, 2.2 Food Cost Analytics, 2.3 Rentabilidad por Producto.

**Compliance resuelto antes de implementar:**
- R1: REQ-2.1.1 — columna `precio_cmp_cents` en `ingredientes` con DEFAULT 0
- R2: REQ-2.2.2 — snapshot de CMP en `movimientos_stock` al insertar (trigger + albaran RPC)
- R3: REQ-X.5 — GIN index recomendado en `pedidos.detalle_pedido` (no obligatorio Bloque 2, documented as follow-up)
- R4: BUG-1 — `analytics_food_cost_teorico` usa dos CTEs separadas (costes_unitarios + ventas_agrupadas), NO cross-join
- R5: BUG-2 — `trigger_fn_recalcular_cmp` guard contra stock negativo + division by zero
- R6: BUG-3 / CAMPO_CIEGO_1 — `analytics_margen_productos` usa `universo_productos` LEFT JOIN (no INNER), así aparecen productos sin receta
- R7: CAMPO_CIEGO_2 — O(N×M) fix en frontend: pre-calcular `totalRealCents` una vez ANTES del JSX map

**Delivery:** 3 PRs apilados hacia `develop` (stacked PRs). Cada PR es autónomo y revisable.

---

## File Map

| PR | Accion | Archivo | Que hace |
|----|--------|---------|----------|
| 1 | Create | `supabase/migrations/20260715000003_food_cost_analytics.sql` | Columns, RPCs (teórico/real/margen), trigger CMP snapshot, GIN index |
| 1 | Create | `src/core/domain/entities/analytics-types.ts` | DTOs: FoodCostTeoricoRow, FoodCostRealRow, MargenProductoRow, AnalyticsPeriodParams |
| 1 | Modify | `src/core/domain/entities/stock-types.ts` | Agregar `precioCmpCents` y `precioUnitarioCmpCents` a interfaces |
| 1 | Create | `src/core/domain/repositories/IAnalyticsRepository.ts` | Interface: foodCostTeorico, foodCostReal, margenProductos |
| 2 | Create | `src/core/infrastructure/repositories/supabase-analytics.repository.ts` | Implementación: llamadas a RPC |
| 2 | Modify | `src/core/infrastructure/repositories/supabase-stock.repository.ts` | Snapshot CMP en createMerma + createMovimiento |
| 2 | Modify | `src/core/infrastructure/database/index.ts` | Lazy singleton: getAnalyticsRepository, getAnalyticsUseCase |
| 2 | Create | `src/core/application/use-cases/analytics.use-case.ts` | Use cases: getFoodCostTeorico, getFoodCostReal, getMargenProductos |
| 2 | Create | `src/app/api/admin/analytics/food-cost/route.ts` | GET endpoint: auth + call use cases |
| 2 | Create | `src/app/api/admin/analytics/rentabilidad/route.ts` | GET endpoint: auth + call use cases |
| 3 | Create | `src/app/admin/(protected)/analytics/food-cost/page.tsx` | Period picker + table teórico/real + warning banner |
| 3 | Create | `src/app/admin/(protected)/analytics/rentabilidad/page.tsx` | Period picker + sortable table margen + color coding |
| 3 | Modify | `src/components/admin/admin-sidebar.tsx` | Añadir grupo "Analytics" con 2 ítems, requiresRestaurant: true |
| 3 | Modify | `src/lib/translations/` (5 files) | Keys: analytics.foodCost.*, analytics.rentabilidad.* |

---

## PR 1 — Infraestructura DB + Domain Types + Interfaces Repositorio

> **Base branch:** `develop`
> **Estimated lines:** ~350

### Task 1.1: Migración SQL completa

**File:** `supabase/migrations/20260715000003_food_cost_analytics.sql`

- [ ] **Step 1: Crear columnas en ingredientes y movimientos_stock**

```sql
-- supabase/migrations/20260715000003_food_cost_analytics.sql

BEGIN;

-- ============================================================
-- 1. COLUMNAS NUEVAS PARA CMP
-- ============================================================

ALTER TABLE public.ingredientes
  ADD COLUMN IF NOT EXISTS precio_cmp_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.movimientos_stock
  ADD COLUMN IF NOT EXISTS precio_unitario_cmp_cents INTEGER;
  -- nullable: NULL para movimientos pre-migración, 0+ para nuevos

-- GIN index para analytics_food_cost_teorico (BUG-3 fix)
CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_pedido_gin ON public.pedidos
  USING GIN (detalle_pedido);

-- ============================================================
-- 2. RPC: analytics_food_cost_teorico (BUG-1 FIXED — two CTEs, no cross-join)
-- ============================================================

CREATE OR REPLACE FUNCTION public.analytics_food_cost_teorico(
  p_empresa_id UUID,
  p_desde      TIMESTAMPTZ,
  p_hasta      TIMESTAMPTZ
)
RETURNS TABLE (
  producto_id              UUID,
  nombre                   TEXT,
  unidades_vendidas        NUMERIC,
  coste_receta_cents       INTEGER,
  coste_total_teorico_cents BIGINT,
  items_sin_producto       BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  WITH
  costes_unitarios AS (
    SELECT ri.producto_id,
      SUM(ri.cantidad_necesaria * i.precio_cmp_cents)::INTEGER AS coste_unitario_cents
    FROM public.receta_items ri
    JOIN public.ingredientes i ON i.id = ri.ingrediente_id
    WHERE i.empresa_id = p_empresa_id
    GROUP BY ri.producto_id
  ),
  ventas_agrupadas AS (
    SELECT (elem->>'producto_id')::UUID AS producto_id,
      SUM((elem->>'cantidad')::NUMERIC) AS unidades
    FROM public.pedidos p
    CROSS JOIN LATERAL jsonb_array_elements(p.detalle_pedido) AS elem
    WHERE p.empresa_id = p_empresa_id
      AND p.created_at >= p_desde AND p.created_at < p_hasta
      AND (elem->>'producto_id') IS NOT NULL
    GROUP BY (elem->>'producto_id')::UUID
  ),
  sin_producto AS (
    SELECT COUNT(*)::BIGINT AS cnt
    FROM public.pedidos p
    CROSS JOIN LATERAL jsonb_array_elements(p.detalle_pedido) AS elem
    WHERE p.empresa_id = p_empresa_id
      AND p.created_at >= p_desde AND p.created_at < p_hasta
      AND (elem->>'producto_id') IS NULL
  )
  SELECT v.producto_id, pr.nombre, v.unidades AS unidades_vendidas,
    COALESCE(cu.coste_unitario_cents, 0) AS coste_receta_cents,
    (v.unidades * COALESCE(cu.coste_unitario_cents, 0))::BIGINT AS coste_total_teorico_cents,
    (SELECT cnt FROM sin_producto) AS items_sin_producto
  FROM ventas_agrupadas v
  JOIN public.productos pr ON pr.id = v.producto_id
  LEFT JOIN costes_unitarios cu ON cu.producto_id = v.producto_id
  ORDER BY pr.nombre;
END;
$$;

-- ============================================================
-- 3. RPC: analytics_food_cost_real
-- ============================================================

CREATE OR REPLACE FUNCTION public.analytics_food_cost_real(
  p_empresa_id UUID,
  p_desde      TIMESTAMPTZ,
  p_hasta      TIMESTAMPTZ
)
RETURNS TABLE (
  ingrediente_id         UUID,
  nombre                 TEXT,
  consumo_qty            NUMERIC,
  coste_total_cents      BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT ms.ingrediente_id,
    i.nombre,
    SUM(ms.cantidad)::NUMERIC AS consumo_qty,
    SUM((ms.cantidad * ms.precio_unitario_cmp_cents))::BIGINT AS coste_total_cents
  FROM public.movimientos_stock ms
  JOIN public.ingredientes i ON i.id = ms.ingrediente_id
  WHERE ms.empresa_id = p_empresa_id
    AND ms.tipo IN ('deduccion', 'merma', 'inventario')
    AND ms.precio_unitario_cmp_cents IS NOT NULL
    AND ms.created_at >= p_desde AND ms.created_at < p_hasta
  GROUP BY ms.ingrediente_id, i.nombre
  ORDER BY i.nombre;
END;
$$;

-- ============================================================
-- 4. RPC: analytics_margen_productos (BUG-3 FIXED — universo_productos no INNER JOIN)
-- ============================================================

CREATE OR REPLACE FUNCTION public.analytics_margen_productos(
  p_empresa_id UUID,
  p_desde      TIMESTAMPTZ,
  p_hasta      TIMESTAMPTZ
)
RETURNS TABLE (
  producto_id           UUID,
  nombre                TEXT,
  precio_venta_cents    INTEGER,
  coste_receta_cents    INTEGER,
  margen_bruto_cents    INTEGER,
  margen_porcentaje     NUMERIC,
  unidades_vendidas    NUMERIC,
  contribucion_total_cents BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  WITH
  universo_productos AS (
    SELECT pr.id, pr.nombre, pr.precio
    FROM public.productos pr WHERE pr.empresa_id = p_empresa_id
  ),
  costes_receta AS (
    SELECT ri.producto_id,
      SUM(ri.cantidad_necesaria * i.precio_cmp_cents)::INTEGER AS coste_unitario_cents
    FROM public.receta_items ri
    INNER JOIN public.ingredientes i ON i.id = ri.ingrediente_id
    GROUP BY ri.producto_id
  ),
  ventas_periodo AS (
    SELECT (elem->>'producto_id')::UUID AS producto_id,
      SUM((elem->>'cantidad')::NUMERIC) AS unidades
    FROM public.pedidos p
    CROSS JOIN LATERAL jsonb_array_elements(p.detalle_pedido) AS elem
    WHERE p.empresa_id = p_empresa_id
      AND p.created_at >= p_desde AND p.created_at < p_hasta
      AND (elem->>'producto_id') IS NOT NULL
    GROUP BY (elem->>'producto_id')::UUID
  )
  SELECT up.id, up.nombre,
    ROUND(up.precio::NUMERIC * 100)::INTEGER AS precio_venta_cents,
    COALESCE(cr.coste_unitario_cents, 0)::INTEGER AS coste_receta_cents,
    (ROUND(up.precio::NUMERIC * 100)::INTEGER - COALESCE(cr.coste_unitario_cents, 0))::INTEGER AS margen_bruto_cents,
    CASE WHEN up.precio = 0 THEN 0::NUMERIC
      ELSE ROUND(((ROUND(up.precio::NUMERIC * 100)::INTEGER - COALESCE(cr.coste_unitario_cents, 0))::NUMERIC
        / (up.precio::NUMERIC * 100)) * 100, 2)
    END AS margen_porcentaje,
    COALESCE(vp.unidades, 0)::NUMERIC AS unidades_vendidas,
    ((ROUND(up.precio::NUMERIC * 100)::INTEGER - COALESCE(cr.coste_unitario_cents, 0)) * COALESCE(vp.unidades, 0))::BIGINT AS contribucion_total_cents
  FROM universo_productos up
  LEFT JOIN costes_receta cr ON cr.producto_id = up.id
  LEFT JOIN ventas_periodo vp ON vp.producto_id = up.id
  ORDER BY contribucion_total_cents DESC;
END;
$$;

-- ============================================================
-- 5. TRIGGER: CMP snapshot on manual movimientos (BUG-2 FIXED)
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_fn_recalcular_cmp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_old_cmp_cents INTEGER;
  v_old_qty       NUMERIC;
  v_new_cmp       INTEGER;
BEGIN
  IF NEW.ingrediente_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.tipo = 'entrada' THEN
    SELECT precio_cmp_cents, cantidad_actual INTO v_old_cmp_cents, v_old_qty
    FROM public.ingredientes WHERE id = NEW.ingrediente_id FOR UPDATE;
    -- CC-2 fix: guard against division by zero with negative stock
    IF (COALESCE(v_old_qty, 0) + NEW.cantidad) <= 0 THEN
      v_new_cmp := COALESCE(NEW.precio_unitario_cmp_cents, 0);
    ELSIF v_old_qty <= 0 OR v_old_cmp_cents = 0 THEN
      v_new_cmp := COALESCE(NEW.precio_unitario_cmp_cents, 0);
    ELSE
      v_new_cmp := ROUND(
        (v_old_cmp_cents::NUMERIC * v_old_qty + COALESCE(NEW.precio_unitario_cmp_cents, 0)::NUMERIC * NEW.cantidad)
        / (v_old_qty + NEW.cantidad))::INTEGER;
    END IF;
    UPDATE public.ingredientes SET precio_cmp_cents = v_new_cmp WHERE id = NEW.ingrediente_id;
    NEW.precio_unitario_cmp_cents := v_new_cmp;
  ELSE
    SELECT precio_cmp_cents INTO v_old_cmp_cents FROM public.ingredientes WHERE id = NEW.ingrediente_id;
    NEW.precio_unitario_cmp_cents := v_old_cmp_cents;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_recalcular_cmp
  BEFORE INSERT ON public.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION public.trigger_fn_recalcular_cmp();

COMMIT;
```

- [ ] **Step 2: Verificar índices y permisos**
  - GIN index en `pedidos.detalle_pedido` creado
  - RPCs tienen SECURITY DEFINER STABLE
  - No se requieren RLS nuevas (tablas existentes)

---

### Task 1.2: Domain Types — `analytics-types.ts`

**File:** `src/core/domain/entities/analytics-types.ts`

- [ ] **Step 1: Crear archivo con tipos analíticos**

```typescript
// src/core/domain/entities/analytics-types.ts

export interface FoodCostTeoricoRow {
  productoId: string;
  nombreProducto: string;
  unidadesVendidas: number;
  costeRecetaCents: number;
  costeTotalTeoricoCents: number;
  itemsSinProducto: number;
}

export interface FoodCostRealRow {
  ingredienteId: string;
  nombre: string;
  consumoQty: number;
  costeTotalCents: number;
}

export interface MargenProductoRow {
  productoId: string;
  nombre: string;
  precioVentaCents: number;
  costeRecetaCents: number;
  margenBrutoCents: number;
  margenPorcentaje: number;
  unidadesVendidas: number;
  contribucionTotalCents: number;
}

export interface AnalyticsPeriodParams {
  empresaId: string;
  desde: string; // ISO timestamp
  hasta: string; // ISO timestamp
}

export interface FoodCostAnalyticsResponse {
  teorico: FoodCostTeoricoRow[];
  real: FoodCostRealRow[];
  itemsSinProducto: number;
}

export interface RentabilidadResponse {
  items: MargenProductoRow[];
}
```

---

### Task 1.3: Modificar `stock-types.ts`

**File:** `src/core/domain/entities/stock-types.ts`

- [ ] **Step 1: Agregar campos CMP a interfaces existentes**

```typescript
// En src/core/domain/entities/stock-types.ts

export interface Ingrediente {
  // Campos existentes...
  precioCmpCents: number; // NEW: 0 = nunca recibido
}

export interface MovimientoStock {
  // Campos existentes...
  precioUnitarioCmpCents: number | null; // NEW: null para pre-migración
}
```

---

### Task 1.4: Repository Interface — `IAnalyticsRepository.ts`

**File:** `src/core/domain/repositories/IAnalyticsRepository.ts`

- [ ] **Step 1: Crear interface de repositorio de análiticos**

```typescript
// src/core/domain/repositories/IAnalyticsRepository.ts

import { Result, AppError } from '@/lib/result';
import {
  FoodCostTeoricoRow,
  FoodCostRealRow,
  MargenProductoRow,
  AnalyticsPeriodParams,
} from '@/core/domain/entities/analytics-types';

export interface IAnalyticsRepository {
  foodCostTeorico(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostTeoricoRow[], AppError>>;

  foodCostReal(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostRealRow[], AppError>>;

  margenProductos(
    params: AnalyticsPeriodParams
  ): Promise<Result<MargenProductoRow[], AppError>>;
}
```

---

## PR 2 — Backend: Repository Implementation + Use Cases + API Routes

> **Base branch:** `develop` (after PR 1 merges)
> **Estimated lines:** ~300

### Task 2.1: Repository Implementation — `supabase-analytics.repository.ts`

**File:** `src/core/infrastructure/repositories/supabase-analytics.repository.ts`

- [ ] **Step 1: Crear repositorio de Supabase**

```typescript
// src/core/infrastructure/repositories/supabase-analytics.repository.ts

import { SupabaseClient } from '@supabase/supabase-js';
import { Result, AppError } from '@/lib/result';
import { ErrorLogger } from '@/lib/error-logger';
import {
  FoodCostTeoricoRow,
  FoodCostRealRow,
  MargenProductoRow,
  AnalyticsPeriodParams,
} from '@/core/domain/entities/analytics-types';
import { IAnalyticsRepository } from '@/core/domain/repositories/IAnalyticsRepository';

export class SupabaseAnalyticsRepository implements IAnalyticsRepository {
  constructor(private supabase: SupabaseClient) {}

  async foodCostTeorico(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostTeoricoRow[], AppError>> {
    try {
      const { data, error } = await this.supabase.rpc(
        'analytics_food_cost_teorico',
        {
          p_empresa_id: params.empresaId,
          p_desde: params.desde,
          p_hasta: params.hasta,
        }
      );

      if (error) {
        return ErrorLogger.logAndReturnError(
          'SupabaseAnalyticsRepository.foodCostTeorico',
          error,
          { empresaId: params.empresaId }
        );
      }

      const mapped = (data || []).map((row: any) => ({
        productoId: row.producto_id,
        nombreProducto: row.nombre,
        unidadesVendidas: parseFloat(row.unidades_vendidas),
        costeRecetaCents: row.coste_receta_cents,
        costeTotalTeoricoCents: row.coste_total_teorico_cents,
        itemsSinProducto: row.items_sin_producto,
      }));

      return { success: true, data: mapped };
    } catch (err) {
      return ErrorLogger.logAndReturnError(
        'SupabaseAnalyticsRepository.foodCostTeorico',
        err,
        { empresaId: params.empresaId }
      );
    }
  }

  async foodCostReal(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostRealRow[], AppError>> {
    try {
      const { data, error } = await this.supabase.rpc(
        'analytics_food_cost_real',
        {
          p_empresa_id: params.empresaId,
          p_desde: params.desde,
          p_hasta: params.hasta,
        }
      );

      if (error) {
        return ErrorLogger.logAndReturnError(
          'SupabaseAnalyticsRepository.foodCostReal',
          error,
          { empresaId: params.empresaId }
        );
      }

      const mapped = (data || []).map((row: any) => ({
        ingredienteId: row.ingrediente_id,
        nombre: row.nombre,
        consumoQty: parseFloat(row.consumo_qty),
        costeTotalCents: row.coste_total_cents,
      }));

      return { success: true, data: mapped };
    } catch (err) {
      return ErrorLogger.logAndReturnError(
        'SupabaseAnalyticsRepository.foodCostReal',
        err,
        { empresaId: params.empresaId }
      );
    }
  }

  async margenProductos(
    params: AnalyticsPeriodParams
  ): Promise<Result<MargenProductoRow[], AppError>> {
    try {
      const { data, error } = await this.supabase.rpc(
        'analytics_margen_productos',
        {
          p_empresa_id: params.empresaId,
          p_desde: params.desde,
          p_hasta: params.hasta,
        }
      );

      if (error) {
        return ErrorLogger.logAndReturnError(
          'SupabaseAnalyticsRepository.margenProductos',
          error,
          { empresaId: params.empresaId }
        );
      }

      const mapped = (data || []).map((row: any) => ({
        productoId: row.producto_id,
        nombre: row.nombre,
        precioVentaCents: row.precio_venta_cents,
        costeRecetaCents: row.coste_receta_cents,
        margenBrutoCents: row.margen_bruto_cents,
        margenPorcentaje: parseFloat(row.margen_porcentaje) || 0,
        unidadesVendidas: parseFloat(row.unidades_vendidas),
        contribucionTotalCents: row.contribucion_total_cents,
      }));

      return { success: true, data: mapped };
    } catch (err) {
      return ErrorLogger.logAndReturnError(
        'SupabaseAnalyticsRepository.margenProductos',
        err,
        { empresaId: params.empresaId }
      );
    }
  }
}
```

---

### Task 2.2: Modificar `supabase-stock.repository.ts` para snapshot CMP

**File:** `src/core/infrastructure/repositories/supabase-stock.repository.ts`

- [ ] **Step 1: Modificar `createMerma` para snapshot CMP**

En el método `createMerma`, leer el precio CMP actual antes de insertar:

```typescript
// Leer precio_cmp_cents antes de insertar
const { data: ingrediente } = await this.supabase
  .from('ingredientes')
  .select('precio_cmp_cents')
  .eq('id', params.ingredienteId)
  .eq('empresa_id', params.empresaId)
  .single();

const precioCmpCents = ingrediente?.precio_cmp_cents || 0;

// Insertar con snapshot
const { data } = await this.supabase
  .from('movimientos_stock')
  .insert({
    ...movement,
    precio_unitario_cmp_cents: precioCmpCents,
  });
```

- [ ] **Step 2: Verificar `createMovimiento` también snapshot CMP si aplica**

---

### Task 2.3: Registrar repositorio y use case en `index.ts`

**File:** `src/core/infrastructure/database/index.ts`

- [ ] **Step 1: Agregar lazy singleton para analytics**

```typescript
// En src/core/infrastructure/database/index.ts

import { SupabaseAnalyticsRepository } from '../repositories/supabase-analytics.repository';
import { AnalyticsUseCase } from '@/core/application/use-cases/analytics.use-case';

let analyticsRepository: SupabaseAnalyticsRepository | null = null;

export function getAnalyticsRepository(): SupabaseAnalyticsRepository {
  if (!analyticsRepository) {
    analyticsRepository = new SupabaseAnalyticsRepository(getSupabaseClient());
  }
  return analyticsRepository;
}

let analyticsUseCase: AnalyticsUseCase | null = null;

export function getAnalyticsUseCase(): AnalyticsUseCase {
  if (!analyticsUseCase) {
    analyticsUseCase = new AnalyticsUseCase(getAnalyticsRepository());
  }
  return analyticsUseCase;
}
```

---

### Task 2.4: Use Case — `analytics.use-case.ts`

**File:** `src/core/application/use-cases/analytics.use-case.ts`

- [ ] **Step 1: Crear use case con métodos públicos**

```typescript
export class AnalyticsUseCase {
  constructor(private repo: IAnalyticsRepository) {}

  async getFoodCostTeorico(params: AnalyticsPeriodParams) {
    return this.repo.foodCostTeorico(params);
  }

  async getFoodCostReal(params: AnalyticsPeriodParams) {
    return this.repo.foodCostReal(params);
  }

  async getMargenProductos(params: AnalyticsPeriodParams) {
    return this.repo.margenProductos(params);
  }

  async getFoodCostAnalytics(params: AnalyticsPeriodParams) {
    const [teoricoResult, realResult] = await Promise.all([
      this.getFoodCostTeorico(params),
      this.getFoodCostReal(params),
    ]);

    if (!teoricoResult.success || !realResult.success) {
      return teoricoResult.success ? realResult : teoricoResult;
    }

    const itemsSinProducto = teoricoResult.data[0]?.itemsSinProducto || 0;

    return {
      success: true,
      data: {
        teorico: teoricoResult.data,
        real: realResult.data,
        itemsSinProducto,
      },
    };
  }
}
```

---

### Task 2.5: API Route — `/api/admin/analytics/food-cost/route.ts`

**File:** `src/app/api/admin/analytics/food-cost/route.ts`

- [ ] **Step 1: Crear endpoint GET con validación de fechas**

Verificar que ambos parámetros `desde` y `hasta` existen y son ISO timestamps válidos. Llamar use cases en paralelo.

- [ ] **Step 2: Retornar response con estructura `{ teorico, real, itemsSinProducto }`**

---

### Task 2.6: API Route — `/api/admin/analytics/rentabilidad/route.ts`

**File:** `src/app/api/admin/analytics/rentabilidad/route.ts`

- [ ] **Step 1: Crear endpoint GET**

Mismo patrón de validación. Retornar `{ data: MargenProductoRow[] }`

---

## PR 3 — Frontend: Pages + Sidebar + Translations

> **Base branch:** `develop` (after PR 2 merges)
> **Estimated lines:** ~350

### Task 3.1: Page — `/admin/(protected)/analytics/food-cost/page.tsx`

**File:** `src/app/admin/(protected)/analytics/food-cost/page.tsx`

- [ ] **Step 1: Crear página con period picker**

Period picker con botones rápidos (Hoy, Este mes) y date inputs custom.

- [ ] **Step 2: Implementar tabla teórico/real comparativa**

Columnas: Producto, Unidades vendidas, Coste teórico, Total teórico.

- [ ] **Step 3: Warning banner si `itemsSinProducto > 0`**

Mostrar conteo de items sin producto_id.

- [ ] **Step 4: Implementar O(N×M) FIX**

Pre-calcular `totalTeoricoCents` UNA VEZ con `useMemo`, NO dentro del map de JSX.

---

### Task 3.2: Page — `/admin/(protected)/analytics/rentabilidad/page.tsx`

**File:** `src/app/admin/(protected)/analytics/rentabilidad/page.tsx`

- [ ] **Step 1: Crear tabla sorteable**

Columnas: Producto, Precio venta, Coste receta, Margen bruto, Margen %, Unidades vendidas, Contribución total.

- [ ] **Step 2: Implementar color coding en Margen %**

- Green: >= 60%
- Yellow: 30% to 59%
- Red: < 30%
- Gray: precio_venta = 0

- [ ] **Step 3: Client-side sorting**

Clicks en headers togglean sort ASC/DESC.

---

### Task 3.3: Modificar Sidebar

**File:** `src/components/admin/admin-sidebar.tsx`

- [ ] **Step 1: Agregar grupo "Analytics"**

Con 2 items:
- Food Cost: `/admin/analytics/food-cost`
- Rentabilidad: `/admin/analytics/rentabilidad`

Ambas con `requiresRestaurant: true`

---

### Task 3.4: Agregar Translation Keys

**Files:** `src/lib/translations/es.ts`, `en.ts`, `fr.ts`, `it.ts`, `de.ts`

- [ ] **Step 1: Crear keys bajo `analytics.*`**

Mínimas requeridas:
- `analytics.foodCost.title`
- `analytics.foodCost.itemsWithoutProduct`
- `analytics.foodCost.disclaimer`
- `analytics.rentabilidad.title`
- `analytics.period.today`, `.thisMonth`
- `analytics.column.*` (todas las columnas de las tablas)
- `sidebar.analytics`

---

## Checklist Compliance

- [ ] **R1**: `precio_cmp_cents` column added, DEFAULT 0 on `ingredientes`
- [ ] **R2**: `precio_unitario_cmp_cents` snapshot on movimientos_stock INSERTs via trigger + manual methods
- [ ] **R3**: GIN index on `pedidos.detalle_pedido` created
- [ ] **R4**: `analytics_food_cost_teorico` uses TWO separate CTEs (costes_unitarios + ventas_agrupadas), not cross-join (BUG-1 FIXED)
- [ ] **R5**: `trigger_fn_recalcular_cmp` guards against negative stock + division by zero (BUG-2 FIXED)
- [ ] **R6**: `analytics_margen_productos` includes ALL products via LEFT JOIN to `universo_productos` (CAMPO_CIEGO_1 FIXED)
- [ ] **R7**: Food cost page pre-calculates `totalTeoricoCents` once before JSX map (O(N×M) FIXED)
- [ ] **X.1**: All routes call `requireRole(['admin', 'superadmin'])` + `resolveAdminContextWithEmpresa`
- [ ] **X.2**: All endpoints reject requests without both `desde` and `hasta`
- [ ] **X.3**: All UI strings use `t()` from translations
- [ ] **X.4**: Sidebar entries have `requiresRestaurant: true`
- [ ] **X.5**: No new tables; analytics RPCs are SECURITY DEFINER
- [ ] **X.6**: Domain types, repository interface, use cases follow Clean Architecture

---

## Testing Strategy

| Layer | What | Approach |
|-------|------|------------|
| DB | CMP formula correctness | INSERT movimiento tipo='entrada', verify `ingredientes.precio_cmp_cents` |
| DB | Analytics RPCs return correct aggregates | Seed data, call each RPC, assert output shape |
| Unit | AnalyticsUseCase mapping | Mock IAnalyticsRepository, verify shape |
| Integration | API routes return 200 + correct shape | Test endpoint with mock use case |
| E2E | Pages render correctly | (Optional; visual correctness at integration sufficient) |

---

## Known Gaps / Follow-ups

- **GIN index performance**: If production queries exceed 2s, consider partitioning strategy (defer to Bloque 3).
- **Historical data**: `movimientos_stock` rows before migration have `precio_unitario_cmp_cents = NULL`; no backfill in scope. UI disclaims this.
- **Items_sin_producto counting**: Counts number of JSONB items where `producto_id IS NULL`. UI displays as "X items not tracked".
