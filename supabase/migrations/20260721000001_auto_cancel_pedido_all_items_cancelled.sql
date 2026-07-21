-- Trigger: when ALL items of a pedido are marked 'cancelado' in pedido_item_estados,
-- automatically set pedidos.estado = 'cancelado'.
-- This keeps pedidos.estado consistent with item-level state so that:
--   1. SSR (loadMesaData) excludes fully-cancelled pedidos via neq('estado','cancelado')
--   2. get_mesas_with_sessions RPC stops counting their totals
--   3. No flash-then-disappear in the TPV ticket panel

CREATE OR REPLACE FUNCTION fn_auto_cancel_pedido_when_all_items_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_detalle_length INTEGER;
  v_total_count    INTEGER;
  v_cancel_count   INTEGER;
BEGIN
  -- Length of detalle_pedido JSONB array = expected number of item rows
  SELECT jsonb_array_length(detalle_pedido)
  INTO   v_detalle_length
  FROM   pedidos
  WHERE  id = NEW.pedido_id;

  -- Guard: empty or missing detalle_pedido, do nothing
  IF v_detalle_length IS NULL OR v_detalle_length = 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE estado = 'cancelado')
  INTO v_total_count, v_cancel_count
  FROM pedido_item_estados
  WHERE pedido_id = NEW.pedido_id;

  -- All items must have an explicit row AND every row must be 'cancelado'
  IF v_total_count = v_detalle_length AND v_cancel_count = v_detalle_length THEN
    UPDATE pedidos
    SET    estado = 'cancelado'
    WHERE  id     = NEW.pedido_id
      AND  estado != 'cancelado';  -- idempotent
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_cancel_pedido
  AFTER INSERT OR UPDATE ON public.pedido_item_estados
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_cancel_pedido_when_all_items_cancelled();

-- Update get_mesas_with_sessions to exclude fully-cancelled pedidos from the session total.
-- Fully-cancelled pedidos now have pedidos.estado = 'cancelado' (set by the trigger above),
-- so filtering them out keeps both the gross sum and the cancellation subtraction consistent.

DROP FUNCTION IF EXISTS get_mesas_with_sessions(UUID);

CREATE FUNCTION get_mesas_with_sessions(p_empresa_id UUID)
RETURNS TABLE (
  id              UUID,
  empresa_id      UUID,
  numero          INT,
  nombre          TEXT,
  sesion_id       UUID,
  sesion_pagada   BOOLEAN,
  pago_en_curso   BOOLEAN,
  session_total   NUMERIC,
  cliente_activo  BOOLEAN,
  division_activa BOOLEAN,
  llamada_activa  BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    m.id,
    m.empresa_id,
    m.numero,
    m.nombre,
    ms.id                                             AS sesion_id,
    COALESCE(ms.sesion_pagada,   false)               AS sesion_pagada,
    COALESCE(ms.pago_en_curso,   false)               AS pago_en_curso,
    GREATEST(
      -- Gross total: exclude fully-cancelled pedidos (estado = 'cancelado')
      COALESCE((
        SELECT SUM(p.total)
        FROM   pedidos p
        WHERE  p.sesion_id = ms.id
          AND  p.estado   != 'cancelado'
      ), 0)
      -- Subtract cancelled items from partially-cancelled pedidos
      - COALESCE((
        SELECT SUM(
          ((d.item->>'precio')::NUMERIC) * ((d.item->>'cantidad')::NUMERIC)
        )
        FROM pedidos p2
        JOIN pedido_item_estados pie
          ON pie.pedido_id = p2.id
         AND pie.estado    = 'cancelado'
        CROSS JOIN LATERAL (
          SELECT elem AS item, (pos - 1)::INT AS idx
          FROM jsonb_array_elements(p2.detalle_pedido)
            WITH ORDINALITY AS t(elem, pos)
        ) d
        WHERE p2.sesion_id = ms.id
          AND p2.estado   != 'cancelado'  -- skip fully-cancelled (already excluded from sum)
          AND pie.item_idx = d.idx
      ), 0),
      0
    )                                                 AS session_total,
    COALESCE(ms.cliente_activo,  false)               AS cliente_activo,
    (ms.division_personas IS NOT NULL)                AS division_activa,
    COALESCE(ms.llamada_activa,  false)               AS llamada_activa
  FROM       mesas         m
  LEFT JOIN  mesa_sesiones ms ON ms.id = m.sesion_id
  WHERE m.empresa_id = p_empresa_id
  ORDER BY m.numero ASC;
$$;

GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO authenticated;

-- Backfill: fix stale pedidos whose items are all cancelled in pedido_item_estados
-- but whose pedidos.estado was never updated (pre-trigger data).
UPDATE pedidos p
SET    estado = 'cancelado'
WHERE  p.estado != 'cancelado'
  AND  EXISTS (
    SELECT 1
    FROM   pedidos p2
    WHERE  p2.id = p.id
      AND  jsonb_array_length(p2.detalle_pedido) > 0
      AND  jsonb_array_length(p2.detalle_pedido) = (
             SELECT COUNT(*)
             FROM   pedido_item_estados pie
             WHERE  pie.pedido_id = p2.id
               AND  pie.estado   = 'cancelado'
           )
      AND  jsonb_array_length(p2.detalle_pedido) = (
             SELECT COUNT(*)
             FROM   pedido_item_estados pie2
             WHERE  pie2.pedido_id = p2.id
           )
  );
