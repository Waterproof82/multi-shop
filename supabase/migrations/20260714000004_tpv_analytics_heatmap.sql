-- supabase/migrations/20260714000004_tpv_analytics_heatmap.sql
-- Heatmap de ventas por día de semana × hora (7×24 matriz)

CREATE OR REPLACE FUNCTION tpv_analytics_heatmap(
  p_empresa_id UUID,
  p_desde      DATE,
  p_hasta      DATE
)
RETURNS TABLE (dow INT, hora INT, total_cents BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    EXTRACT(DOW  FROM cobrado_at AT TIME ZONE 'Europe/Madrid')::INT  AS dow,
    EXTRACT(HOUR FROM cobrado_at AT TIME ZONE 'Europe/Madrid')::INT  AS hora,
    COALESCE(SUM(importe_cobrado_cents), 0)::BIGINT                  AS total_cents
  FROM public.tpv_cobros
  WHERE empresa_id          = p_empresa_id
    AND cobrado_at         >= p_desde::timestamptz
    AND cobrado_at          < (p_hasta + interval '1 day')::timestamptz
    AND rectifica_cobro_id IS NULL
  GROUP BY dow, hora
  ORDER BY dow, hora;
$$;

GRANT EXECUTE ON FUNCTION tpv_analytics_heatmap(UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION tpv_analytics_heatmap(UUID, DATE, DATE) TO authenticated;
