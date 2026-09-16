-- Menús virtuales: árboles de navegación adicionales sobre productos ya
-- existentes (ver docs/superpowers/specs/2026-09-16-menus-virtuales-design.md).
-- padre_id NULL = menú de nivel superior; padre_id no-nulo = subcategoría.
CREATE TABLE public.menus_virtuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  padre_id UUID REFERENCES public.menus_virtuales(id) ON DELETE CASCADE,
  nombre_es TEXT NOT NULL,
  nombre_en TEXT,
  nombre_fr TEXT,
  nombre_it TEXT,
  nombre_de TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menus_virtuales_empresa_id ON public.menus_virtuales(empresa_id);
CREATE INDEX idx_menus_virtuales_padre_id ON public.menus_virtuales(padre_id);

ALTER TABLE public.menus_virtuales ENABLE ROW LEVEL SECURITY;

-- AS RESTRICTIVE: se combina con AND, ninguna policy permisiva agregada
-- despues puede anularla (ver docs/context/security.md, incidente 2026-07-31).
CREATE POLICY "No direct anon access to menus_virtuales"
  ON public.menus_virtuales AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve menus_virtuales"
  ON public.menus_virtuales FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta menus_virtuales"
  ON public.menus_virtuales FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin edita menus_virtuales"
  ON public.menus_virtuales FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin elimina menus_virtuales"
  ON public.menus_virtuales FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus_virtuales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus_virtuales TO authenticated;
