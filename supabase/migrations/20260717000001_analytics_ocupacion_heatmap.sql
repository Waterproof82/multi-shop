-- supabase/migrations/20260717000001_analytics_ocupacion_heatmap.sql
-- Heatmap de ocupación de mesas por día de semana × hora (7×24 matriz)
-- Fuente: mesa_sesiones (apertura de sesión de mesa)

-- Índice compuesto para la query del heatmap (verificado: no existe previamente)
CREATE INDEX IF NOT EXISTS idx_mesa_sesiones_empresa_created
  ON public.mesa_sesiones (empresa_id, created_at);

CREATE OR REPLACE FUNCTION analytics_ocupacion_heatmap(
  p_empresa_id uuid,
  p_desde      timestamptz,
  p_hasta      timestamptz
)
RETURNS TABLE (
  dow              int,
  hour             int,
  count            bigint,
  avg_duration_min int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    EXTRACT(DOW  FROM created_at AT TIME ZONE 'Europe/Madrid')::int  AS dow,
    EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Madrid')::int  AS hour,
    COUNT(*)::bigint                                                   AS count,
    AVG(
      EXTRACT(EPOCH FROM (COALESCE(cerrada_at, NOW()) - created_at)) / 60
    )::int                                                             AS avg_duration_min
  FROM public.mesa_sesiones
  WHERE empresa_id = p_empresa_id
    AND created_at >= p_desde
    AND created_at  < p_hasta
  GROUP BY dow, hour
  ORDER BY dow, hour;
$$;

GRANT EXECUTE ON FUNCTION analytics_ocupacion_heatmap(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_ocupacion_heatmap(uuid, timestamptz, timestamptz) TO authenticated;
