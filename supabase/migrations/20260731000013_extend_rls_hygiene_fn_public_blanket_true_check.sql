-- Closes a real gap found while reviewing test coverage before merging to
-- develop: check_rls_policy_hygiene() caught roles:public policies calling
-- get_mi_empresa_id()/auth.uid(), but NOT a blanket `USING (true)` for
-- roles:public unrelated to any function call — exactly the shape of the
-- "Public can select idioma" leak on clientes (dropped in 20260731000007).
-- A RESTRICTIVE anon-deny only protects the `anon` role; it does nothing
-- against a `roles:public USING(true)` policy leaking to `authenticated`
-- sessions from other tenants. Without this check, that exact leak could
-- reappear on any table (not just clientes) undetected.
--
-- Whitelist: categorias/empresas/productos "Publico ve X" are the only
-- legitimate public-catalog reads in this schema (storefront menu browsing) —
-- update INTENTIONAL_PUBLIC_TRUE_TABLES in
-- e2e/compliance/rls-policy-hygiene.spec.ts if a new one is added deliberately.

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
    AND NOT c.relrowsecurity;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rls_policy_hygiene() TO service_role;
