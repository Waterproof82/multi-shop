-- Helper function for the E2E security audit test (capa 2).
-- Returns all SECURITY DEFINER functions in the public schema that have
-- explicit EXECUTE grants to 'anon' or 'authenticated'.
--
-- Used by: e2e/compliance/supabase-security-definer.spec.ts
-- Only callable via service_role (REVOKE FROM PUBLIC).
--
-- The test compares the result against a whitelist of intentionally
-- exposed functions (currently only get_mi_empresa_id for authenticated).

CREATE OR REPLACE FUNCTION public.check_security_definer_grants()
RETURNS TABLE(routine_name TEXT, grantee TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
  SELECT
    r.routine_name::TEXT,
    g.grantee::TEXT
  FROM information_schema.routines r
  JOIN information_schema.role_routine_grants g
    ON g.routine_name    = r.routine_name
   AND g.routine_schema  = r.routine_schema
   AND g.specific_schema = r.specific_schema
  WHERE r.routine_schema = 'public'
    AND r.security_type  = 'DEFINER'
    AND g.grantee        IN ('anon', 'authenticated', 'PUBLIC')
  ORDER BY r.routine_name, g.grantee;
$$;

-- Only service_role can call this audit function.
REVOKE EXECUTE ON FUNCTION public.check_security_definer_grants() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_security_definer_grants() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_security_definer_grants() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_security_definer_grants() TO service_role;
