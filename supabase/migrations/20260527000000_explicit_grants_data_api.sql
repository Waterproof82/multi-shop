-- Explicit table GRANTs for Supabase Data API compliance.
-- Reference: https://github.com/orgs/supabase/discussions/45329
-- From October 30, 2026, automatic grants are removed for all projects.
-- service_role bypasses RLS but still needs table-level GRANTs.
-- Idempotent: GRANT is a no-op if the privilege already exists.

-- ================================================================
-- service_role: full access on all tables (used exclusively by the
-- backend API — see getSupabaseClient() with SUPABASE_SERVICE_ROLE_KEY)
-- ================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfiles_admin    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promociones       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_errors        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.codigos_descuento TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesas             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_sesiones     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tgtg_reservas     TO service_role;

-- ================================================================
-- authenticated: access on tables that have RLS policies for admins.
-- RLS (already enabled on all tables) further restricts what each
-- admin role can read or modify at row level.
-- ================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfiles_admin    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promociones       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.log_errors        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.codigos_descuento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesas             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_sesiones     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tgtg_reservas     TO authenticated;

-- ================================================================
-- anon: SELECT-only on public-facing tables (shop menu/catalog).
-- All other tables already have explicit DENY RLS policies for anon
-- (see migration 20260323210214_enable_rls_all_tables.sql).
-- ================================================================
GRANT SELECT ON public.empresas   TO anon;
GRANT SELECT ON public.productos  TO anon;
GRANT SELECT ON public.categorias TO anon;
