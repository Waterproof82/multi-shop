-- Gap found by an external security audit (2026-07-31, post-hardening): the
-- root-cause fix in 20260731000017 (ALTER DEFAULT PRIVILEGES REVOKE on
-- public) only stops NEW tables/functions/sequences from inheriting
-- anon/authenticated access. It does not retroactively touch objects that
-- already existed when it ran. Confirmed live: all 53 pre-existing tables in
-- `public` still carry table-level INSERT/UPDATE/DELETE/TRUNCATE grants for
-- `anon` from whatever default-privilege configuration predated this
-- project's Supabase-managed-hosting bootstrap.
--
-- Why check_rls_policy_hygiene() never caught this: every check added so far
-- audits policy *shape* (PERMISSIVE vs RESTRICTIVE, roles:public, missing
-- search_path, missing WITH CHECK...) — it assumes the GRANT surface is
-- already minimal and only verifies the RLS logic layered on top of it. None
-- of the 9 checks ever asked "does this role even need this grant at all".
-- RLS and GRANTs are separate, additive layers in Postgres: a policy can be
-- flawless and still be moot if the underlying privilege shouldn't exist.
--
-- Why this specific gap matters more than "RLS already blocks it": RLS
-- policies apply to SELECT/INSERT/UPDATE/DELETE, never to TRUNCATE. No
-- RESTRICTIVE deny-all, however well written, can stop `anon` from issuing
-- TRUNCATE on a table it has TRUNCATE privilege on. Today this isn't reachable
-- over the network (anon/authenticated are NOLOGIN — only `authenticator` can
-- open a session and then SET ROLE per JWT claim — and PostgREST never maps
-- any HTTP verb to TRUNCATE), but it is a defense-in-depth failure and a
-- standing violation of this project's own documented policy (CLAUDE.md
-- migration checklist: anon gets SELECT only, and only on public catalog
-- tables). One future SECURITY DEFINER function with dynamic SQL, or a
-- misconfigured proxy, is all it takes to turn this from theoretical into a
-- one-statement wipe of fiscal (`pedidos`, `tpv_cobros`) or labor
-- (`lc_fichajes*`) records that Ley 11/2021 and RD-Ley 8/2019 require to be
-- immutable.
--
-- Scope: `anon` only. `authenticated` is left untouched — the app's RLS
-- model relies on `authenticated` performing real DML under tenant-scoped
-- policies (empresa_id = get_mi_empresa_id()), verified extensively across
-- pg_policies. Revoking there needs its own audit pass, not a same-day
-- blanket revoke.
--
-- Dynamic loop instead of a hardcoded table list: matches this project's
-- established preference (see testing-ci.md → "Cómo agregar un test de
-- regresión de seguridad nuevo") for whole-schema checks over enumerated
-- ones — this also self-heals if a table is renamed or added outside this
-- migration before the fix ships.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p') -- ordinary + partitioned tables
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon;',
      t.tablename
    );
  END LOOP;
END $$;

-- Extend the hygiene function with a permanent regression check: any table
-- where anon still holds one of these four privileges is a violation, full
-- stop — this project's architecture is anon-reads-only / service_role-writes
-- (see security.md → "Row Level Security (RLS)"), so there is no legitimate
-- exception to whitelist here (unlike public_role_blanket_true, which has
-- categorias/empresas/productos as intentional catalog reads).
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
    AND p.with_check IS NULL

  UNION ALL

  -- 10) anon holding table-level write privileges it structurally can never
  -- need: this project's architecture is anon-reads-only (RLS-gated
  -- SELECT) / service_role-writes. TRUNCATE is the load-bearing case — RLS
  -- cannot restrict it under any policy shape, so this is the only layer
  -- that can catch it.
  SELECT
    'anon_write_grant'::TEXT,
    g.table_name::TEXT,
    NULL::TEXT,
    ('privilege=' || g.privilege_type)::TEXT
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public'
    AND g.grantee = 'anon'
    AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
$$;

REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rls_policy_hygiene() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rls_policy_hygiene() TO service_role;
