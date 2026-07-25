-- ============================================================================
-- Migration: 20260725000005_revoke_authenticated_analytics.sql
-- Purpose:   Resolve lint 0029 (authenticated_security_definer_function_executable)
--            for the 8 RPC analytics/transactional functions.
--
-- Why safe: All callers in the app use getSupabaseClient() which is initialized
--           with SUPABASE_SERVICE_ROLE_KEY. PostgREST maps service_role key →
--           service_role Postgres role. That role retains EXECUTE.
--           Revoking from authenticated blocks direct front-end RPC calls while
--           leaving server-side (service_role) calls intact.
--
-- get_mi_empresa_id() is intentionally excluded — it is called directly from
-- RLS USING clauses and must remain executable by authenticated.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.analytics_cierre_turno(uuid)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.analytics_food_cost_real(uuid, timestamp with time zone, timestamp with time zone)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.analytics_food_cost_teorico(uuid, timestamp with time zone, timestamp with time zone)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.analytics_margen_productos(uuid, timestamp with time zone, timestamp with time zone)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.analytics_ocupacion_heatmap(uuid, timestamp with time zone, timestamp with time zone)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.recibir_albaran_transaccional(uuid, uuid, uuid)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.tpv_analytics_heatmap(uuid, date, date)
  FROM authenticated;


-- ============================================================================
-- Rollback:
-- GRANT EXECUTE ON FUNCTION public.analytics_cierre_turno(uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.analytics_food_cost_real(uuid, timestamptz, timestamptz) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.analytics_food_cost_teorico(uuid, timestamptz, timestamptz) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.analytics_margen_productos(uuid, timestamptz, timestamptz) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.analytics_ocupacion_heatmap(uuid, timestamptz, timestamptz) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.recibir_albaran_transaccional(uuid, uuid, uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.tpv_analytics_heatmap(uuid, date, date) TO authenticated;
-- ============================================================================
