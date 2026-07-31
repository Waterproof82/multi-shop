-- Closes the last two `roles: public` findings from the full schema re-audit
-- (perfiles_admin, promociones). Unlike the get_mi_empresa_id() cases fixed in
-- 20260731000005/000007, these reference auth.uid() directly, which never
-- throws for anon (it just returns NULL, and comparisons/subqueries against
-- NULL evaluate cleanly to false/no-rows) — so there was no active leak and
-- no permission-denied fragility here. Fixed anyway for consistency: every
-- "Admin"/"own row" policy in this schema should be scoped TO authenticated,
-- not public, on principle — public implicitly includes anon, and there is
-- no scenario where an anonymous request should ever be a candidate for
-- these policies.

-- --- perfiles_admin ---
DROP POLICY IF EXISTS "Users can insert own perfil_admin" ON public.perfiles_admin;
CREATE POLICY "Users can insert own perfil_admin"
  ON public.perfiles_admin FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can select own perfil_admin" ON public.perfiles_admin;
CREATE POLICY "Users can select own perfil_admin"
  ON public.perfiles_admin FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own perfil_admin" ON public.perfiles_admin;
CREATE POLICY "Users can update own perfil_admin"
  ON public.perfiles_admin FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()));

-- --- promociones ---
DROP POLICY IF EXISTS "Empresa users can select promociones" ON public.promociones;
CREATE POLICY "Empresa users can select promociones"
  ON public.promociones FOR SELECT
  TO authenticated
  USING (empresa_id IN (
    SELECT perfiles_admin.empresa_id FROM perfiles_admin
    WHERE perfiles_admin.id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Empresa users can insert promociones" ON public.promociones;
CREATE POLICY "Empresa users can insert promociones"
  ON public.promociones FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id IN (
    SELECT perfiles_admin.empresa_id FROM perfiles_admin
    WHERE perfiles_admin.id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Empresa users can update promociones" ON public.promociones;
CREATE POLICY "Empresa users can update promociones"
  ON public.promociones FOR UPDATE
  TO authenticated
  USING (empresa_id IN (
    SELECT perfiles_admin.empresa_id FROM perfiles_admin
    WHERE perfiles_admin.id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Empresa users can delete promociones" ON public.promociones;
CREATE POLICY "Empresa users can delete promociones"
  ON public.promociones FOR DELETE
  TO authenticated
  USING (empresa_id IN (
    SELECT perfiles_admin.empresa_id FROM perfiles_admin
    WHERE perfiles_admin.id = (SELECT auth.uid())
  ));
