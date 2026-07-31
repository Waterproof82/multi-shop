-- Root-cause fix for the entire class of incidents found today (anon RLS
-- leak, SECURITY INVOKER RPC exposure, etc.): the `public` schema had
-- ALTER DEFAULT PRIVILEGES configured (by both `postgres` and
-- `supabase_admin`, likely inherited from this project's pre-Oct-2026
-- Supabase bootstrap, before explicit grants became the platform default)
-- that automatically grant anon/authenticated FULL privileges on every NEW
-- table (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER), EXECUTE
-- on every new function, and SELECT/UPDATE/USAGE on every new sequence —
-- confirmed via pg_default_acl. This means every table/function created in
-- this project has been insecure-by-default from the moment CREATE TABLE/
-- CREATE FUNCTION ran, and only became safe once someone remembered to
-- REVOKE it explicitly — which is exactly the pattern behind every incident
-- fixed today (pedidos/mesa_sesiones/pedido_item_estados, the 6 custom-
-- payment RPCs, etc.).
--
-- This migration flips the default going forward: new objects created by
-- role `postgres` (the role every migration in this project actually runs
-- as, via the Supabase CLI / MCP) get NO anon/authenticated privileges
-- unless a migration explicitly GRANTs them, matching what CLAUDE.md's
-- migration checklist ("GRANTs explícitos obligatorio desde oct 2026")
-- already assumes should be true. Verified live: a throwaway table created
-- after this migration got zero anon/authenticated grants, versus full
-- access before. Zero impact on existing objects — ALTER DEFAULT PRIVILEGES
-- only affects objects created AFTER this runs.
--
-- The `supabase_admin`-owned default ACL entries could NOT be revoked here
-- (permission denied — postgres is not a member of supabase_admin in
-- Supabase's managed hosting) and remain granting anon/authenticated on
-- objects created by that role. Not currently exploitable: no part of this
-- project's actual migration/dev workflow (Supabase CLI, MCP, dashboard SQL
-- editor as the project owner) creates objects as supabase_admin — that
-- role is reserved for Supabase's own internal bootstrapping. Tracked as a
-- known residual limitation in check_rls_policy_hygiene()'s
-- default_privileges_grant_anon check (whitelisted in
-- e2e/compliance/rls-policy-hygiene.spec.ts) rather than silently ignored.
--
-- service_role is untouched — it bypasses RLS by design and is meant to
-- have full access to everything server-side.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
