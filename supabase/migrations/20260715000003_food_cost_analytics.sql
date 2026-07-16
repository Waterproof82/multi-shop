-- supabase/migrations/20260715000003_food_cost_analytics.sql
-- Bloque 2: Food Cost Avanzado — CMP engine, analytics RPCs, margin analysis

BEGIN;

-- ============================================================
-- 1. NUEVAS COLUMNAS PARA CMP
-- ============================================================

ALTER TABLE public.ingredientes
  ADD COLUMN IF NOT EXISTS precio_cmp_cents INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.ingredientes.precio_cmp_cents IS
  'Weighted average cost (CMP) per base unit in cents. 0 = never received. System-managed only.';

ALTER TABLE public.movimientos_stock
  ADD COLUMN IF NOT EXISTS precio_unitario_cmp_cents INTEGER;
COMMENT ON COLUMN public.movimientos_stock.precio_unitario_cmp_cents IS
  'CMP snapshot at INSERT time for immutable food cost history. NULL for pre-migration rows.';

-- ============================================================
-- 2. GIN INDEX ON pedidos.detalle_pedido (BUG-3 fix)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_pedido_gin
  ON public.pedidos USING GIN (detalle_pedido);

-- ============================================================
-- 3. RPC: analytics_food_cost_teorico
--    BUG-1 FIXED: two separate CTEs — costes_unitarios + ventas_agrupadas
--    No cross-join between cost and sales data
-- ============================================================

CREATE OR REPLACE FUNCTION public.analytics_food_cost_teorico(
  p_empresa_id UUID,
  p_desde      TIMESTAMPTZ,
  p_hasta      TIMESTAMPTZ
)
RETURNS TABLE (
  producto_id               UUID,
  nombre                    TEXT,
  unidades_vendidas         NUMERIC,
  coste_receta_cents        INTEGER,
  coste_total_teorico_cents BIGINT,
  items_sin_producto        BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- CTE 1: unit costs from recipes (no sales data here)
  costes_unitarios AS (
    SELECT
      ri.producto_id,
      SUM(ri.cantidad_necesaria * i.precio_cmp_cents)::INTEGER AS coste_unitario_cents
    FROM public.receta_items ri
    JOIN public.ingredientes i ON i.id = ri.ingrediente_id
    WHERE i.empresa_id = p_empresa_id
    GROUP BY ri.producto_id
  ),
  -- CTE 2: aggregated sales from JSONB (no cost data here)
  ventas_agrupadas AS (
    SELECT
      (elem->>'producto_id')::UUID AS producto_id,
      SUM((elem->>'cantidad')::NUMERIC) AS unidades
    FROM public.pedidos p
    CROSS JOIN LATERAL jsonb_array_elements(p.detalle_pedido) AS elem
    WHERE p.empresa_id = p_empresa_id
      AND p.created_at >= p_desde
      AND p.created_at < p_hasta
      AND (elem->>'producto_id') IS NOT NULL
    GROUP BY (elem->>'producto_id')::UUID
  ),
  -- CTE 3: count items without producto_id for the warning banner
  sin_producto AS (
    SELECT COUNT(*)::BIGINT AS cnt
    FROM public.pedidos p
    CROSS JOIN LATERAL jsonb_array_elements(p.detalle_pedido) AS elem
    WHERE p.empresa_id = p_empresa_id
      AND p.created_at >= p_desde
      AND p.created_at < p_hasta
      AND (elem->>'producto_id') IS NULL
  )
  SELECT
    v.producto_id,
    pr.nombre,
    v.unidades                                                         AS unidades_vendidas,
    COALESCE(cu.coste_unitario_cents, 0)                               AS coste_receta_cents,
    (v.unidades * COALESCE(cu.coste_unitario_cents, 0))::BIGINT        AS coste_total_teorico_cents,
    (SELECT cnt FROM sin_producto)                                     AS items_sin_producto
  FROM ventas_agrupadas v
  JOIN public.productos pr ON pr.id = v.producto_id
  LEFT JOIN costes_unitarios cu ON cu.producto_id = v.producto_id
  ORDER BY pr.nombre;
END;
$$;

-- ============================================================
-- 4. RPC: analytics_food_cost_real
--    Real cost based on actual stock movements with CMP snapshots
-- ============================================================

CREATE OR REPLACE FUNCTION public.analytics_food_cost_real(
  p_empresa_id UUID,
  p_desde      TIMESTAMPTZ,
  p_hasta      TIMESTAMPTZ
)
RETURNS TABLE (
  ingrediente_id    UUID,
  nombre            TEXT,
  consumo_qty       NUMERIC,
  coste_total_cents BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ms.ingrediente_id,
    i.nombre,
    SUM(ms.cantidad)::NUMERIC                                   AS consumo_qty,
    SUM((ms.cantidad * ms.precio_unitario_cmp_cents))::BIGINT   AS coste_total_cents
  FROM public.movimientos_stock ms
  JOIN public.ingredientes i ON i.id = ms.ingrediente_id
  WHERE ms.empresa_id = p_empresa_id
    AND ms.tipo IN ('deduccion', 'merma', 'inventario')
    AND ms.precio_unitario_cmp_cents IS NOT NULL
    AND ms.created_at >= p_desde
    AND ms.created_at < p_hasta
  GROUP BY ms.ingrediente_id, i.nombre
  ORDER BY i.nombre;
END;
$$;

-- ============================================================
-- 5. RPC: analytics_margen_productos
--    CC-1 FIXED: universo_productos (ALL products) LEFT JOIN — no inner join filter
--    Products without recipes still appear with coste = 0
-- ============================================================

CREATE OR REPLACE FUNCTION public.analytics_margen_productos(
  p_empresa_id UUID,
  p_desde      TIMESTAMPTZ,
  p_hasta      TIMESTAMPTZ
)
RETURNS TABLE (
  producto_id              UUID,
  nombre                   TEXT,
  precio_venta_cents       INTEGER,
  coste_receta_cents       INTEGER,
  margen_bruto_cents       INTEGER,
  margen_porcentaje        NUMERIC,
  unidades_vendidas        NUMERIC,
  contribucion_total_cents BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- CTE 1: ALL products for this tenant — the universe, no join filter
  universo_productos AS (
    SELECT pr.id, pr.nombre, pr.precio
    FROM public.productos pr
    WHERE pr.empresa_id = p_empresa_id
  ),
  -- CTE 2: recipe cost per product (only products with recipes appear)
  costes_receta AS (
    SELECT
      ri.producto_id,
      SUM(ri.cantidad_necesaria * i.precio_cmp_cents)::INTEGER AS coste_unitario_cents
    FROM public.receta_items ri
    INNER JOIN public.ingredientes i ON i.id = ri.ingrediente_id
    GROUP BY ri.producto_id
  ),
  -- CTE 3: sales aggregated from JSONB in date range
  ventas_periodo AS (
    SELECT
      (elem->>'producto_id')::UUID AS producto_id,
      SUM((elem->>'cantidad')::NUMERIC) AS unidades
    FROM public.pedidos p
    CROSS JOIN LATERAL jsonb_array_elements(p.detalle_pedido) AS elem
    WHERE p.empresa_id = p_empresa_id
      AND p.created_at >= p_desde
      AND p.created_at < p_hasta
      AND (elem->>'producto_id') IS NOT NULL
    GROUP BY (elem->>'producto_id')::UUID
  )
  SELECT
    up.id                                                                       AS producto_id,
    up.nombre,
    ROUND(up.precio::NUMERIC * 100)::INTEGER                                    AS precio_venta_cents,
    COALESCE(cr.coste_unitario_cents, 0)::INTEGER                               AS coste_receta_cents,
    (ROUND(up.precio::NUMERIC * 100)::INTEGER
      - COALESCE(cr.coste_unitario_cents, 0))::INTEGER                          AS margen_bruto_cents,
    CASE
      WHEN up.precio = 0 THEN 0::NUMERIC
      ELSE ROUND(
        (
          (ROUND(up.precio::NUMERIC * 100)::INTEGER - COALESCE(cr.coste_unitario_cents, 0))::NUMERIC
          / (up.precio::NUMERIC * 100)
        ) * 100,
        2
      )
    END                                                                         AS margen_porcentaje,
    COALESCE(vp.unidades, 0)::NUMERIC                                           AS unidades_vendidas,
    (
      (ROUND(up.precio::NUMERIC * 100)::INTEGER - COALESCE(cr.coste_unitario_cents, 0))
      * COALESCE(vp.unidades, 0)
    )::BIGINT                                                                   AS contribucion_total_cents
  FROM universo_productos up
  LEFT JOIN costes_receta cr ON cr.producto_id = up.id
  LEFT JOIN ventas_periodo vp ON vp.producto_id = up.id
  ORDER BY contribucion_total_cents DESC;
END;
$$;

-- ============================================================
-- 6. TRIGGER: CMP recalculation on movimientos_stock INSERT
--    BUG-2 FIXED: guard against negative stock + division by zero
--    CC-2 FIXED: when total qty after entry <= 0, use new price directly
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_fn_recalcular_cmp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_cmp_cents INTEGER;
  v_old_qty       NUMERIC;
  v_new_cmp       INTEGER;
BEGIN
  -- Skip rows without an ingredient (sin_receta movements)
  IF NEW.ingrediente_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo = 'entrada' THEN
    -- Lock the row to prevent concurrent CMP drift
    SELECT precio_cmp_cents, cantidad_actual
    INTO v_old_cmp_cents, v_old_qty
    FROM public.ingredientes
    WHERE id = NEW.ingrediente_id
    FOR UPDATE;

    -- CC-2: guard division by zero in negative/zero stock scenarios
    IF (COALESCE(v_old_qty, 0) + NEW.cantidad) <= 0 THEN
      -- Total after entry is still <= 0: use incoming price as new CMP
      v_new_cmp := COALESCE(NEW.precio_unitario_cmp_cents, 0);
    ELSIF v_old_qty <= 0 OR v_old_cmp_cents = 0 THEN
      -- No existing stock or never priced: new price becomes CMP
      v_new_cmp := COALESCE(NEW.precio_unitario_cmp_cents, 0);
    ELSE
      -- Standard CMP weighted average formula
      v_new_cmp := ROUND(
        (
          v_old_cmp_cents::NUMERIC * v_old_qty
          + COALESCE(NEW.precio_unitario_cmp_cents, 0)::NUMERIC * NEW.cantidad
        )
        / (v_old_qty + NEW.cantidad)
      )::INTEGER;
    END IF;

    -- Update the ingredient's CMP
    UPDATE public.ingredientes
    SET precio_cmp_cents = v_new_cmp
    WHERE id = NEW.ingrediente_id;

    -- Stamp the movement with the newly computed CMP
    NEW.precio_unitario_cmp_cents := v_new_cmp;

  ELSE
    -- Non-entrada movements (deduccion, merma, ajuste, etc.):
    -- snapshot current CMP for immutable cost history
    SELECT precio_cmp_cents
    INTO v_old_cmp_cents
    FROM public.ingredientes
    WHERE id = NEW.ingrediente_id;

    NEW.precio_unitario_cmp_cents := v_old_cmp_cents;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_recalcular_cmp
  BEFORE INSERT ON public.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION public.trigger_fn_recalcular_cmp();

-- ============================================================
-- 7. GRANT EXECUTE on all analytics RPCs
-- ============================================================

GRANT EXECUTE ON FUNCTION public.analytics_food_cost_teorico(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.analytics_food_cost_real(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.analytics_margen_productos(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated, service_role;

COMMIT;
