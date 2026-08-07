-- Excluir los pedidos de prueba de la agregación anual del dashboard.
--
-- Marcar los pedidos sintéticos (20260801000004) solo sirve si además se los
-- saca de las cifras. Hoy contaminan de forma visible: cinco de los diez
-- primeros puestos de "Top Platos del Año" son fixtures (`__test_comida__`,
-- `__test_pase_paused__`, ...), e inflan los conteos de pedidos — no los
-- importes, porque su total es cero, lo que hace el problema más difícil de
-- detectar: cuadra el dinero pero no el número de pedidos.
--
-- Redefine get_pedido_stats_ano (20260801000003) añadiendo `AND NOT es_prueba`
-- en las tres lecturas de `pedidos`. Sin cambios en la firma ni en los grants.

CREATE OR REPLACE FUNCTION public.get_pedido_stats_ano(
  p_empresa_id  uuid,
  p_year_start  timestamptz,
  p_today_start timestamptz,
  p_range_end   timestamptz,
  p_prev_start  timestamptz,
  p_prev_end    timestamptz
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  WITH del_ano AS (
    SELECT total, created_at, detalle_pedido
    FROM public.pedidos
    WHERE empresa_id = p_empresa_id
      AND created_at >= p_year_start
      AND NOT es_prueba
  ),
  platos AS (
    SELECT
      item ->> 'nombre' AS nombre,
      SUM(COALESCE(NULLIF((item ->> 'cantidad')::numeric, 0), 1)) AS cantidad,
      SUM(
        COALESCE((item ->> 'precio')::numeric, 0)
        * COALESCE(NULLIF((item ->> 'cantidad')::numeric, 0), 1)
      ) AS total
    FROM del_ano
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(del_ano.detalle_pedido) = 'array' THEN del_ano.detalle_pedido
        ELSE '[]'::jsonb
      END
    ) AS item
    WHERE item ->> 'nombre' IS NOT NULL
    GROUP BY item ->> 'nombre'
    ORDER BY cantidad DESC
    LIMIT 10
  ),
  prev AS (
    SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS suma
    FROM public.pedidos
    WHERE empresa_id = p_empresa_id
      AND created_at >= p_prev_start
      AND created_at <= p_prev_end
      AND NOT es_prueba
  ),
  hoy AS (
    SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS suma
    FROM del_ano
    WHERE created_at >= p_today_start
      AND created_at <= p_range_end
  )
  SELECT jsonb_build_object(
    'totalAno',         (SELECT COALESCE(SUM(total), 0) FROM del_ano),
    'pedidosHoy',       (SELECT n    FROM hoy),
    'totalHoy',         (SELECT suma FROM hoy),
    'pedidosAnterior',  (SELECT n    FROM prev),
    'ingresosAnterior', (SELECT suma FROM prev),
    'topPlatosAno',     COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'nombre',   nombre,
                'cantidad', cantidad,
                'total',    total))
       FROM platos),
      '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_pedido_stats_ano(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pedido_stats_ano(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pedido_stats_ano(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_pedido_stats_ano(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) TO service_role;
