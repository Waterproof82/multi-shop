-- notify_mesa_sesion_update() is a SECURITY DEFINER trigger function (see
-- 20260731000003_mesa_sesiones_broadcast_trigger.sql) and inherited the default
-- PUBLIC EXECUTE grant, exposing it at /rest/v1/rpc/notify_mesa_sesion_update
-- to anon/authenticated — the exact class of issue documented in
-- e2e/compliance/supabase-security-definer.spec.ts (2026-07-28 incident with
-- rgpd_purge_log_immutable / tpv_cobro_audit_after_insert). Caught by that
-- test's capa 2 SQL scan while verifying today's RLS fix. Per CLAUDE.md, every
-- new SECURITY DEFINER function must REVOKE from PUBLIC/anon/authenticated and
-- GRANT only to service_role — trigger functions don't need EXECUTE from any
-- client role since triggers invoke them internally.

REVOKE EXECUTE ON FUNCTION public.notify_mesa_sesion_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_mesa_sesion_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_mesa_sesion_update() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.notify_mesa_sesion_update() TO service_role;
