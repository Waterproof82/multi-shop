-- The "Admin ve/edita/elimina/crea mesa_sesiones" policies were scoped to
-- `public` (which includes anon) instead of `authenticated`, even though their
-- USING/WITH CHECK clause calls get_mi_empresa_id() — a function only
-- `authenticated` may execute (see the documented exception in CLAUDE.md).
-- Postgres RLS evaluates ALL applicable permissive policies for a role (they
-- are OR'd together), so once 20260731000002_restrict_anon_columns_realtime_tables.sql
-- granted anon column-level SELECT on mesa_sesiones, a plain anon SELECT
-- started also evaluating this policy and raised
-- "permission denied for function get_mi_empresa_id" instead of cleanly
-- falling through to the "No direct anon access to mesa_sesiones" deny-all
-- policy. Not a data leak — access was still denied either way — but a
-- fragile, non-deterministic failure mode discovered while verifying
-- 20260731000004_drop_anon_realtime_select_policies.sql. Narrowing these to
-- `authenticated` (their actual intent) removes anon from the evaluation
-- entirely, matching the equivalent policies on `pedidos`.
--
-- Note: the same `roles: public` + get_mi_empresa_id() pattern exists on
-- categorias, clientes, empresas, mesas, pedidos and productos. Those are
-- pre-existing and out of scope for this fix (none of them currently error
-- for anon — pedidos in particular verified clean via curl), but should be
-- reviewed and normalized to `authenticated` in a follow-up pass.

DROP POLICY IF EXISTS "Admin ve mesa_sesiones" ON public.mesa_sesiones;
CREATE POLICY "Admin ve mesa_sesiones"
  ON public.mesa_sesiones FOR SELECT
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin edita mesa_sesiones" ON public.mesa_sesiones;
CREATE POLICY "Admin edita mesa_sesiones"
  ON public.mesa_sesiones FOR UPDATE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin elimina mesa_sesiones" ON public.mesa_sesiones;
CREATE POLICY "Admin elimina mesa_sesiones"
  ON public.mesa_sesiones FOR DELETE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin crea mesa_sesiones" ON public.mesa_sesiones;
CREATE POLICY "Admin crea mesa_sesiones"
  ON public.mesa_sesiones FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());
