-- Performance: mover a SQL la agregación anual del dashboard admin.
--
-- PROBLEMA
-- `SupabasePedidoRepository.getStats()` traía TODOS los pedidos del año a Node
-- (incluido el JSONB `detalle_pedido` de cada uno) solo para calcular sumas y
-- un top-10 de platos. `pedidos` no admite DELETE (retención fiscal 5 años,
-- Art. 66 LGT), así que ese payload crece de forma indefinida: hoy ~4.000
-- filas/año, en el quinto año de operación serán ~20.000 sin que el resultado
-- mostrado cambie de tamaño — son seis números y una lista de diez platos.
--
-- SOLUCIÓN
-- Agregar en la base y devolver solo el resultado. El payload pasa a ser
-- constante (~1 KB) independientemente del volumen histórico, lo que hace
-- innecesaria cualquier carga progresiva: no hay nada que paginar si no se
-- transfieren las filas.
--
-- EQUIVALENCIA CON LA LÓGICA JS QUE SUSTITUYE
--   sumTotal            -> SUM(COALESCE(total, 0))
--   inDateRange         -> comparación sobre created_at
--   buildTopPlatosFromList -> CTE `platos`, con la misma regla `cantidad || 1`
--     (en JS `Number(item.cantidad) || 1` convierte 0/NaN/ausente en 1; aquí
--     lo replica COALESCE(NULLIF(..., 0), 1)) y el mismo orden y LIMIT 10.
--
-- DIFERENCIA DELIBERADA
-- `pedidosAnterior` / `ingresosAnterior` se calculan consultando el rango del
-- mes anterior directamente, sin acotarlo al año en curso. La versión JS los
-- derivaba del array ya filtrado a `>= yearStart`, así que en enero el mes
-- anterior (diciembre) caía fuera y ambos daban 0. Aquí devuelven el valor
-- correcto. Solo cambia el resultado en enero.

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

-- Solo la capa servidor la invoca (getPedidoRepository usa getSupabaseClient(),
-- que es service_role). Sin estos REVOKE la función quedaría expuesta en
-- /rest/v1/rpc/get_pedido_stats_ano para cualquier cliente anónimo.
REVOKE EXECUTE ON FUNCTION public.get_pedido_stats_ano(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pedido_stats_ano(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pedido_stats_ano(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_pedido_stats_ano(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) TO service_role;
