-- Root-cause fix companion migration. 20260731000017 revoked the `public`
-- schema's default privileges (owned by role `postgres`, the role every
-- migration in this project actually runs as) that were auto-granting
-- anon/authenticated full access to every NEW table/function/sequence —
-- confirmed live by creating a throwaway table and observing it got zero
-- anon/authenticated grants after the fix, versus full access before.
--
-- This migration adds 4 more permanent checks to check_rls_policy_hygiene(),
-- covering the rest of the "insecure Postgres default nobody audits"
-- taxonomy surfaced by today's review:
--
--   - default_privileges_grant_anon: guards against this exact regression —
--     if default privileges for `public` are ever re-granted to anon/
--     authenticated (by any grantor role), this catches it immediately
--     instead of silently exposing every table/function created afterward.
--     Currently still flags the supabase_admin-owned entries that couldn't
--     be revoked (permission denied) — whitelisted in the e2e test with an
--     explanation, not silently ignored.
--   - security_definer_missing_search_path: a SECURITY DEFINER function
--     without SET search_path is vulnerable to schema-hijacking (an
--     attacker who can CREATE in some schema on the caller's search_path
--     can shadow unqualified references the function makes and run code
--     with its elevated privileges). Verified clean today — 0 functions.
--   - bypassrls_unexpected_role: flags any non-superuser role with
--     rolbypassrls=true that isn't one of the standard Supabase system
--     roles — a custom role with this attribute skips RLS entirely
--     regardless of any policy. Verified clean today.
--   - insert_policy_missing_with_check: an INSERT policy with no explicit
--     WITH CHECK defaults to `WITH CHECK (true)` — a silently wide-open
--     write policy. Verified clean today — 0 policies.

CREATE OR REPLACE FUNCTION public.check_rls_policy_hygiene()
RETURNS TABLE(check_name TEXT, tablename TEXT, policyname TEXT, detail TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
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

  SELECT
    'public_role_identity_scoped_fn'::TEXT,
    p.tablename::TEXT,
    p.policyname::TEXT,
    ('qual=' || coalesce(p.qual, '') || ' with_check=' || coalesce(p.with_check, ''))::TEXT
  FROM pg_policies p
  WHERE p.roles::TEXT LIKE '%public%'
    AND (
      coalesce(p.qual, '') LIKE '%get_mi_empresa_id%'
      OR coalesce(p.with_check, '') LIKE '%get_mi_empresa_id%'
      OR coalesce(p.qual, '') LIKE '%auth.uid%'
      OR coalesce(p.with_check, '') LIKE '%auth.uid%'
    )

  UNION ALL

  SELECT
    'public_role_blanket_true'::TEXT,
    p.tablename::TEXT,
    p.policyname::TEXT,
    ('cmd=' || p.cmd || ' qual=' || coalesce(p.qual, '') || ' with_check=' || coalesce(p.with_check, ''))::TEXT
  FROM pg_policies p
  WHERE p.roles::TEXT LIKE '%public%'
    AND (p.qual = 'true' OR p.with_check = 'true')

  UNION ALL

  SELECT
    'rls_disabled'::TEXT,
    c.relname::TEXT,
    NULL::TEXT,
    'row_security is OFF'::TEXT
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity

  UNION ALL

  SELECT
    'view_missing_security_invoker'::TEXT,
    c.relname::TEXT,
    NULL::TEXT,
    (CASE WHEN c.relkind = 'm' THEN 'materialized view (no invoker mode available)' ELSE 'view lacks security_invoker=true' END)::TEXT
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm')
    AND NOT COALESCE(
      (SELECT (split_part(opt, '=', 2))::boolean
       FROM unnest(c.reloptions) AS opt
       WHERE opt LIKE 'security_invoker=%'),
      false
    )

  UNION ALL

  SELECT
    'default_privileges_grant_anon'::TEXT,
    'public'::TEXT,
    pg_get_userbyid(d.defaclrole)::TEXT,
    ('object_type=' || d.defaclobjtype::TEXT || ' acl=' || d.defaclacl::TEXT)::TEXT
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND (d.defaclacl::TEXT LIKE '%anon=%' OR d.defaclacl::TEXT LIKE '%authenticated=%')

  UNION ALL

  SELECT
    'security_definer_missing_search_path'::TEXT,
    p.proname::TEXT,
    NULL::TEXT,
    'SECURITY DEFINER without SET search_path — vulnerable to schema hijacking'::TEXT
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (p.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
    ))

  UNION ALL

  SELECT
    'bypassrls_unexpected_role'::TEXT,
    r.rolname::TEXT,
    NULL::TEXT,
    'rolbypassrls=true on a non-standard role — skips RLS entirely regardless of policies'::TEXT
  FROM pg_roles r
  WHERE r.rolbypassrls = true
    AND r.rolname NOT IN ('service_role', 'supabase_admin', 'supabase_read_only_user', 'supabase_etl_admin', 'postgres')

  UNION ALL

  SELECT
    'insert_policy_missing_with_check'::TEXT,
    p.tablename::TEXT,
    p.policyname::TEXT,
    'INSERT policy with no explicit WITH CHECK defaults to WITH CHECK (true) — wide-open write'::TEXT
  FROM pg_policies p
  WHERE p.cmd = 'INSERT'
    AND p.with_check IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rls_policy_hygiene() TO service_role;
