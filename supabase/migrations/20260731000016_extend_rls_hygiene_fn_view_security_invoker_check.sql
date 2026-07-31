-- Adds a 5th check to check_rls_policy_hygiene(), closing the same class of
-- gap just found and fixed for functions (SECURITY INVOKER vs DEFINER):
-- a VIEW created without explicit `security_invoker = true` runs with the
-- CREATOR's privileges when queried (pre-PG15 semantics, still the default
-- unless overridden), not the querying role's — meaning it can silently
-- bypass RLS on every underlying table regardless of how carefully those
-- tables' policies are hardened. Materialized views have no invoker-mode
-- option at all — they always run as their owner, so ANY matview exposed to
-- anon/authenticated is inherently in this category.
--
-- No views exist in public today (verified via pg_class scan before adding
-- this, and via a throwaway test view that the check correctly caught), so
-- this check currently returns empty — it exists to catch the first one
-- that's ever added without the reader realizing the implication, the same
-- way check_public_function_grants() exists to catch the next SECURITY
-- INVOKER RPC left exposed by accident.

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
    );
$$;

REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rls_policy_hygiene() TO service_role;
