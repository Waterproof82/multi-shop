-- ============================================================================
-- Migration: 20260725000004_revoke_public_security_definer.sql
-- Purpose:   Fix REQ-05 — previous migration 003 did REVOKE FROM anon, but
--            anon inherits EXECUTE from PUBLIC. The correct fix is
--            REVOKE EXECUTE FROM PUBLIC, then re-grant only to the roles
--            that legitimately need direct RPC access.
--
-- Root cause: proacl entries showed `=X/postgres` (PUBLIC grant) surviving
--             after `REVOKE FROM anon`, because anon has no explicit grant —
--             it inherits. Only revoking from PUBLIC removes anon's access.
--
-- Two groups:
--   A) RPC functions used by authenticated admin/waiter code:
--      REVOKE FROM PUBLIC only — keep explicit authenticated + service_role grants.
--   B) Trigger-only functions (never called via RPC by any user):
--      REVOKE FROM PUBLIC + REVOKE FROM authenticated — triggers don't need
--      explicit role grants; Postgres runs them as the trigger owner.
-- ============================================================================


-- ── GROUP A: RPC functions (keep authenticated, remove PUBLIC/anon) ──────────

REVOKE EXECUTE ON FUNCTION public.analytics_cierre_turno(uuid)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.analytics_food_cost_real(uuid, timestamp with time zone, timestamp with time zone)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.analytics_food_cost_teorico(uuid, timestamp with time zone, timestamp with time zone)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.analytics_margen_productos(uuid, timestamp with time zone, timestamp with time zone)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.analytics_ocupacion_heatmap(uuid, timestamp with time zone, timestamp with time zone)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.recibir_albaran_transaccional(uuid, uuid, uuid)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.tpv_analytics_heatmap(uuid, date, date)
  FROM PUBLIC;


-- ── GROUP B: Trigger-only functions (remove PUBLIC + authenticated) ──────────
-- These are TRIGGER functions. No user role should call them via RPC.

REVOKE EXECUTE ON FUNCTION public.fn_auto_cancel_pedido_when_all_items_cancelled()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_auto_cancel_pedido_when_all_items_cancelled()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_clientes_update_ultima_actividad()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_clientes_update_ultima_actividad()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_pedido_removed()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_pedido_removed()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.tpv_cobro_before_insert()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tpv_cobro_before_insert()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.tpv_cobro_block_update()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tpv_cobro_block_update()
  FROM authenticated;


-- ============================================================================
-- Rollback (run manually if needed):
--
-- GRANT EXECUTE ON FUNCTION public.analytics_cierre_turno(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.analytics_food_cost_real(uuid, timestamptz, timestamptz) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.analytics_food_cost_teorico(uuid, timestamptz, timestamptz) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.analytics_margen_productos(uuid, timestamptz, timestamptz) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.analytics_ocupacion_heatmap(uuid, timestamptz, timestamptz) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.recibir_albaran_transaccional(uuid, uuid, uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.tpv_analytics_heatmap(uuid, date, date) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.fn_auto_cancel_pedido_when_all_items_cancelled() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.fn_clientes_update_ultima_actividad() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.notify_pedido_removed() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.tpv_cobro_before_insert() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.tpv_cobro_block_update() TO PUBLIC;
-- ============================================================================
