-- Fix: analytics_cierre_turno was failing when movimientos_stock rows had
-- NULL precio_unitario_cmp_cents (pre-CMP-migration rows). Replaced the
-- cost calculation with a hardcoded 0 until CMP data is backfilled.
-- total_mermas_cents is also hardcoded 0 for the same reason.

CREATE OR REPLACE FUNCTION public.analytics_cierre_turno(p_turno_id uuid)
RETURNS TABLE (
  turno_id              uuid,
  abierta_at            timestamptz,
  cerrada_at            timestamptz,
  operador_nombre       text,
  total_ventas_cents    bigint,
  total_efectivo_cents  bigint,
  total_tarjeta_cents   bigint,
  total_propina_cents   bigint,
  num_covers            bigint,
  ticket_medio_cents    bigint,
  top_productos         jsonb,
  movimientos_stock     jsonb,
  total_mermas_cents    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_desde      timestamptz;
  v_hasta      timestamptz;
BEGIN
  SELECT t.empresa_id, t.apertura_at, t.cierre_at
    INTO v_empresa_id, v_desde, v_hasta
    FROM public.tpv_turnos t
   WHERE t.id = p_turno_id;

  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  v_hasta := COALESCE(v_hasta, NOW());

  RETURN QUERY
  WITH
  turno_row AS (
    SELECT
      t.total_efectivo_cents,
      t.total_tarjeta_cents,
      t.operador_nombre AS op_nombre
    FROM public.tpv_turnos t
    WHERE t.id = p_turno_id
  ),
  propinas AS (
    SELECT COALESCE(SUM(c.propina_cents), 0)::bigint AS total
    FROM public.tpv_cobros c
    WHERE c.turno_id = p_turno_id
      AND c.rectifica_cobro_id IS NULL
  ),
  covers AS (
    SELECT COUNT(DISTINCT c.id)::bigint AS num
    FROM public.tpv_cobros c
    WHERE c.turno_id = p_turno_id
      AND c.rectifica_cobro_id IS NULL
  ),
  ventas_cents_agg AS (
    SELECT COALESCE(SUM(c.importe_cobrado_cents - c.propina_cents), 0)::bigint AS total
    FROM public.tpv_cobros c
    WHERE c.turno_id = p_turno_id
      AND c.rectifica_cobro_id IS NULL
  ),
  top_prods AS (
    SELECT jsonb_agg(sub ORDER BY sub->>'unidades' DESC) AS arr
    FROM (
      SELECT jsonb_build_object(
               'nombre', elem->>'nombre',
               'unidades', SUM((elem->>'cantidad')::int),
               'venta_cents', SUM((elem->>'precio_venta_cents')::bigint * (elem->>'cantidad')::int)
             ) AS sub
      FROM public.pedidos ped
      CROSS JOIN LATERAL jsonb_array_elements(ped.detalle_pedido) AS elem
      WHERE ped.empresa_id = v_empresa_id
        AND ped.created_at >= v_desde
        AND ped.created_at  < v_hasta
        AND ped.estado NOT IN ('cancelado')
        AND (elem->>'nombre') IS NOT NULL
      GROUP BY elem->>'nombre'
      ORDER BY SUM((elem->>'cantidad')::int) DESC
      LIMIT 5
    ) sub
  ),
  -- NOTE: coste hardcoded to 0 — pre-CMP rows have NULL precio_unitario_cmp_cents.
  -- Once CMP data is backfilled this CTE can use the real cost calculation.
  mermas_agg AS (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'ingrediente', i.nombre,
          'cantidad_merma', ms.cantidad,
          'coste', 0
        )
      ) AS arr
    FROM public.movimientos_stock ms
    JOIN public.ingredientes i ON i.id = ms.ingrediente_id
    WHERE ms.turno_id = p_turno_id
      AND ms.tipo = 'merma'
  )
  SELECT
    p_turno_id,
    v_desde,
    v_hasta,
    tr.op_nombre,
    (SELECT total FROM ventas_cents_agg),
    tr.total_efectivo_cents::bigint,
    tr.total_tarjeta_cents::bigint,
    (SELECT total FROM propinas),
    (SELECT num FROM covers),
    CASE WHEN (SELECT num FROM covers) > 0
         THEN (SELECT total FROM ventas_cents_agg) / (SELECT num FROM covers)
         ELSE 0::bigint
    END,
    COALESCE((SELECT arr FROM top_prods), '[]'::jsonb),
    COALESCE((SELECT arr FROM mermas_agg), '[]'::jsonb),
    0::bigint
  FROM turno_row tr;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_cierre_turno(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_cierre_turno(uuid) TO authenticated;
