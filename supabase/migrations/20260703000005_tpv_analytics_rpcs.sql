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
