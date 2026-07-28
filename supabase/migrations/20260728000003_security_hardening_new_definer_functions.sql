-- Security hardening: revoke PUBLIC/anon/authenticated EXECUTE on new SECURITY DEFINER
-- trigger functions created after the July-10 hardening session.
-- These functions are invoked exclusively by PostgreSQL triggers, never by API clients.
-- Advisors flagged: anon_security_definer_function_executable (both)
--                   authenticated_security_definer_function_executable (both)

-- 1. rgpd_purge_log_immutable — trigger that blocks UPDATE/DELETE on rgpd_purge_log.
--    Added ~2026-07-28 (GAP-RGPD-01). Inherited PUBLIC grant on creation.
REVOKE EXECUTE ON FUNCTION public.rgpd_purge_log_immutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rgpd_purge_log_immutable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rgpd_purge_log_immutable() FROM authenticated;

-- 2. tpv_cobro_audit_after_insert — trigger that writes to audit_log on cobro INSERT.
--    Sensitive: touches fiscal data (LGT Art. 66). Inherited PUBLIC grant on creation.
REVOKE EXECUTE ON FUNCTION public.tpv_cobro_audit_after_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tpv_cobro_audit_after_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tpv_cobro_audit_after_insert() FROM authenticated;

-- 3. Explicit anon DENY policies for tgtg tables.
--    Currently only have service_role policy (implicit deny for anon/authenticated).
--    Adding explicit deny follows the project convention and provides defense-in-depth.

CREATE POLICY "No direct anon access to tgtg_items"
  ON public.tgtg_items FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "No direct anon access to tgtg_promociones"
  ON public.tgtg_promociones FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "No direct anon access to tgtg_reservas"
  ON public.tgtg_reservas FOR ALL TO anon
  USING (false) WITH CHECK (false);
