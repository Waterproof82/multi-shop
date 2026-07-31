-- Broadens check_rls_policy_hygiene()'s "public_role_authenticated_only_fn"
-- check (renamed to "public_role_identity_scoped_fn") to also flag
-- roles:public policies referencing auth.uid(), not only get_mi_empresa_id().
-- Both are identity-scoped functions with no legitimate reason to ever be
-- evaluated for an anonymous request; the only correct use of `roles: public`
-- in this schema is genuinely-public catalog data (categorias/empresas/
-- productos "Publico ve X", none of which reference either function).
--
-- Follows 20260731000010_fix_public_role_scope_auth_uid_policies.sql, which
-- fixed the two tables (perfiles_admin, promociones) this broader check would
-- have caught.

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
