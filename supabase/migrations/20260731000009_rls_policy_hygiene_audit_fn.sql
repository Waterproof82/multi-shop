-- Helper function for the E2E security audit test that guards against the two
-- RLS anti-patterns found and fixed on 2026-07-31 (see 20260731000002-000008):
--
--   1. A "deny anon" policy defined as PERMISSIVE instead of RESTRICTIVE.
--      Permissive policies for the same role/command combine with OR, so a
--      later careless permissive `USING (true)` policy (added for an
--      unrelated reason) silently overrides a permissive deny-all and exposes
--      the whole table. RESTRICTIVE policies AND against every permissive
--      one — they can only narrow access, never grant it — making this class
--      of bug structurally impossible regardless of what other policies get
--      added later.
--
--   2. A policy scoped to `roles: public` (which includes anon) whose
--      USING/WITH CHECK calls get_mi_empresa_id() — a function only
--      `authenticated` may execute (see the exception documented in
--      CLAUDE.md). Because permissive policies are all evaluated for a
--      matching role, this throws "permission denied for function
--      get_mi_empresa_id" for anon instead of a clean deny, the moment anon
--      becomes eligible to evaluate that policy (e.g. after an unrelated
--      column-grant change). Should always be scoped `TO authenticated`.
--
--   3. Tables with row_security disabled entirely.
--
-- Used by: e2e/compliance/rls-policy-hygiene.spec.ts
-- Only callable via service_role (REVOKE FROM PUBLIC/anon/authenticated).

CREATE OR REPLACE FUNCTION public.check_rls_policy_hygiene()
RETURNS TABLE(check_name TEXT, tablename TEXT, policyname TEXT, detail TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
  -- 1) PERMISSIVE deny-all for anon (should always be RESTRICTIVE)
  SELECT
    'permissive_anon_deny'::TEXT,
    p.tablename::TEXT,
    p.policyname::TEXT,
    ('roles=' || p.roles::TEXT || ' cmd=' || p.cmd)::TEXT
  FROM pg_policies p
  WHERE p.roles::TEXT = '{anon}'
    AND p.qual = 'false'
    AND p.permissive = 'PERMISSIVE'

  UNION ALL

  -- 2) roles:public policy referencing an authenticated-only function
  SELECT
    'public_role_authenticated_only_fn'::TEXT,
    p.tablename::TEXT,
    p.policyname::TEXT,
    ('qual=' || coalesce(p.qual, '') || ' with_check=' || coalesce(p.with_check, ''))::TEXT
  FROM pg_policies p
  WHERE p.roles::TEXT LIKE '%public%'
    AND (
      coalesce(p.qual, '') LIKE '%get_mi_empresa_id%'
      OR coalesce(p.with_check, '') LIKE '%get_mi_empresa_id%'
    )

  UNION ALL

  -- 3) tables with RLS disabled
  SELECT
    'rls_disabled'::TEXT,
    c.relname::TEXT,
    NULL::TEXT,
    'row_security is OFF'::TEXT
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rls_policy_hygiene() TO service_role;
