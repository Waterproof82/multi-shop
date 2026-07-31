-- Systemic follow-up to 20260731000005_fix_mesa_sesiones_admin_policies_role_scope.sql.
-- The same `roles: public` (instead of `authenticated`) pattern — for policies
-- whose USING/WITH CHECK calls get_mi_empresa_id(), a function only
-- `authenticated` may execute — was found on categorias, clientes, empresas,
-- mesas, pedidos and productos. `public` includes `anon`, so any anon request
-- eligible to reach these policies (e.g. after a future column-grant change)
-- would hit "permission denied for function get_mi_empresa_id" instead of a
-- clean deny. Narrowing to `authenticated` (the actual intent in every case)
-- removes anon from the evaluation entirely.
--
-- Additionally, while auditing clientes, found and removed a real cross-tenant
-- PII leak, independent of the role-scope issue above:
--
--   "Public can select idioma" ON clientes FOR SELECT USING (true)
--   (added 2026-04-01, comment: "Update RLS policies to allow selecting idioma")
--
-- The comment's intent was to expose only the `idioma` column, but the
-- implementation is a row-level policy with no column-level GRANT restriction
-- and no tenant scoping (`empresa_id` isn't checked at all). anon is saved by
-- the RESTRICTIVE "No direct anon access to clientes" policy (AND'd on top of
-- every permissive policy), but nothing shields `authenticated` — any
-- authenticated Supabase session, from ANY empresa, could read every column
-- of every company's clientes row (nombre, telefono, email — real PII per
-- CLAUDE.md). Verified clientes is only ever queried server-side via
-- service_role repositories (supabase-cliente.repository.ts,
-- SupabaseSuperAdminRepository.ts) — no client-side code depends on this
-- policy, so it is dead weight. "Admin gestiona clientes" (FOR ALL, tenant-
-- scoped) already covers legitimate SELECT access once re-scoped to
-- `authenticated` below.

-- ── categorias ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin edita categorias" ON public.categorias;
CREATE POLICY "Admin edita categorias"
  ON public.categorias FOR UPDATE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin elimina categorias" ON public.categorias;
CREATE POLICY "Admin elimina categorias"
  ON public.categorias FOR DELETE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin inserta categorias" ON public.categorias;
CREATE POLICY "Admin inserta categorias"
  ON public.categorias FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- ── clientes ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin gestiona clientes" ON public.clientes;
CREATE POLICY "Admin gestiona clientes"
  ON public.clientes FOR ALL
  TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Public can select idioma" ON public.clientes;

-- ── empresas ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin edita su empresa" ON public.empresas;
CREATE POLICY "Admin edita su empresa"
  ON public.empresas FOR UPDATE
  TO authenticated
  USING (id = get_mi_empresa_id());

-- ── mesas ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin crea mesas" ON public.mesas;
CREATE POLICY "Admin crea mesas"
  ON public.mesas FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin edita mesas" ON public.mesas;
CREATE POLICY "Admin edita mesas"
  ON public.mesas FOR UPDATE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin elimina mesas" ON public.mesas;
CREATE POLICY "Admin elimina mesas"
  ON public.mesas FOR DELETE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin ve mesas" ON public.mesas;
CREATE POLICY "Admin ve mesas"
  ON public.mesas FOR SELECT
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- ── pedidos ──────────────────────────────────────────────────────────────────
-- Note: "Anon puede leer pedido por tracking_token" (permissive, anon,
-- USING (tracking_token IS NOT NULL)) is left untouched here — it is already
-- neutralized by the RESTRICTIVE "No direct anon access to pedidos" policy
-- (restrictive policies AND against every permissive one) and is unused dead
-- code (order tracking is served via server-side /api routes with
-- service_role, never direct anon REST). Flagged for a future cleanup pass,
-- out of scope for this fix.
DROP POLICY IF EXISTS "Admin edita pedidos" ON public.pedidos;
CREATE POLICY "Admin edita pedidos"
  ON public.pedidos FOR UPDATE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin elimina pedidos" ON public.pedidos;
CREATE POLICY "Admin elimina pedidos"
  ON public.pedidos FOR DELETE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin ve pedidos" ON public.pedidos;
CREATE POLICY "Admin ve pedidos"
  ON public.pedidos FOR SELECT
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- ── productos ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin edita productos" ON public.productos;
CREATE POLICY "Admin edita productos"
  ON public.productos FOR UPDATE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin elimina productos" ON public.productos;
CREATE POLICY "Admin elimina productos"
  ON public.productos FOR DELETE
  TO authenticated
  USING (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Admin inserta productos" ON public.productos;
CREATE POLICY "Admin inserta productos"
  ON public.productos FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());
