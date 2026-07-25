-- ============================================================================
-- Migration: 20260725000003_revoke_and_search_path.sql
-- Purpose:   Complete REQ-05 and REQ-07 from security-hardening audit.
--
-- REQ-05: REVOKE EXECUTE FROM anon on 13 SECURITY DEFINER functions that
--         were not covered by 20260725000002 (which only handled the 3
--         trigger functions: pedidos_block_delete, lc_immutable_guard,
--         lc_fichajes_chain_before).
--
-- REQ-07: SET search_path = public, pg_catalog on all remaining functions
--         that had mutable search_path. Uses ALTER FUNCTION — no body rewrite.
--
-- Norma: Supabase Security Advisory 0011 (mutable search_path)
--        Supabase Security Advisory 0028/0029 (anon SECURITY DEFINER RPC)
-- ============================================================================


-- ── REQ-05: REVOKE EXECUTE FROM anon ─────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.analytics_food_cost_real(uuid, timestamp with time zone, timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_food_cost_teorico(uuid, timestamp with time zone, timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_margen_productos(uuid, timestamp with time zone, timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_ocupacion_heatmap(uuid, timestamp with time zone, timestamp with time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_cierre_turno(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recibir_albaran_transaccional(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_auto_cancel_pedido_when_all_items_cancelled() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_clientes_update_ultima_actividad() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_pedido_removed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tpv_analytics_heatmap(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tpv_cobro_before_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tpv_cobro_block_update() FROM anon;


-- ── REQ-07: SET search_path = public, pg_catalog ─────────────────────────────
-- Using ALTER FUNCTION — no body rewrite required.

-- TPV turno integrity functions
ALTER FUNCTION public.tpv_turno_block_delete() SET search_path = public, pg_catalog;
ALTER FUNCTION public.tpv_turno_block_update_fields() SET search_path = public, pg_catalog;
ALTER FUNCTION public.tpv_turno_before_insert() SET search_path = public, pg_catalog;
ALTER FUNCTION public.tpv_turno_evento_block_delete() SET search_path = public, pg_catalog;
ALTER FUNCTION public.tpv_turno_evento_block_update() SET search_path = public, pg_catalog;
ALTER FUNCTION public.tpv_turno_auto_audit_events() SET search_path = public, pg_catalog;
ALTER FUNCTION public.tpv_turno_assign_numero_z() SET search_path = public, pg_catalog;

-- Albaran integrity functions
ALTER FUNCTION public.block_albaran_alteration() SET search_path = public, pg_catalog;
ALTER FUNCTION public.block_albaran_deletion() SET search_path = public, pg_catalog;

-- Transactional functions
ALTER FUNCTION public.recibir_albaran_transaccional(uuid, uuid, uuid) SET search_path = public, pg_catalog;

-- Analytics functions
ALTER FUNCTION public.analytics_ocupacion_heatmap(uuid, timestamp with time zone, timestamp with time zone) SET search_path = public, pg_catalog;
ALTER FUNCTION public.analytics_cierre_turno(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.analytics_food_cost_real(uuid, timestamp with time zone, timestamp with time zone) SET search_path = public, pg_catalog;
ALTER FUNCTION public.analytics_food_cost_teorico(uuid, timestamp with time zone, timestamp with time zone) SET search_path = public, pg_catalog;
ALTER FUNCTION public.analytics_margen_productos(uuid, timestamp with time zone, timestamp with time zone) SET search_path = public, pg_catalog;
ALTER FUNCTION public.tpv_analytics_heatmap(uuid, date, date) SET search_path = public, pg_catalog;

-- TPV cobro functions
ALTER FUNCTION public.tpv_cobro_before_insert() SET search_path = public, pg_catalog;
ALTER FUNCTION public.tpv_cobro_block_update() SET search_path = public, pg_catalog;

-- Stock / CMP
ALTER FUNCTION public.trigger_fn_recalcular_cmp() SET search_path = public, pg_catalog;

-- Mesas
ALTER FUNCTION public.get_mesas_with_sessions(uuid) SET search_path = public, pg_catalog;

-- Notifications / triggers
ALTER FUNCTION public.notify_pedido_removed() SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_clientes_update_ultima_actividad() SET search_path = public, pg_catalog;
ALTER FUNCTION public.fn_auto_cancel_pedido_when_all_items_cancelled() SET search_path = public, pg_catalog;

-- LaborControl chain functions
ALTER FUNCTION public.lc_canonical_payload(uuid, uuid, uuid, uuid, uuid, text, text, uuid, timestamp with time zone, timestamp with time zone, text, text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.lc_fichajes_chain_verify_after() SET search_path = public, pg_catalog;


-- ============================================================================
-- Rollback (run manually if needed):
--
-- GRANT EXECUTE ON FUNCTION public.analytics_food_cost_real(uuid, timestamptz, timestamptz) TO anon;
-- GRANT EXECUTE ON FUNCTION public.analytics_food_cost_teorico(uuid, timestamptz, timestamptz) TO anon;
-- GRANT EXECUTE ON FUNCTION public.analytics_margen_productos(uuid, timestamptz, timestamptz) TO anon;
-- GRANT EXECUTE ON FUNCTION public.analytics_ocupacion_heatmap(uuid, timestamptz, timestamptz) TO anon;
-- GRANT EXECUTE ON FUNCTION public.analytics_cierre_turno(uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.recibir_albaran_transaccional(uuid, uuid, uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.fn_auto_cancel_pedido_when_all_items_cancelled() TO anon;
-- GRANT EXECUTE ON FUNCTION public.fn_clientes_update_ultima_actividad() TO anon;
-- GRANT EXECUTE ON FUNCTION public.notify_pedido_removed() TO anon;
-- GRANT EXECUTE ON FUNCTION public.tpv_analytics_heatmap(uuid, date, date) TO anon;
-- GRANT EXECUTE ON FUNCTION public.tpv_cobro_before_insert() TO anon;
-- GRANT EXECUTE ON FUNCTION public.tpv_cobro_block_update() TO anon;
-- ============================================================================
