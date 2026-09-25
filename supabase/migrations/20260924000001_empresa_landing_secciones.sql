-- supabase/migrations/20260924000001_empresa_landing_secciones.sql
-- Secciones de landing gestionables por tipo fijo (ver
-- docs/superpowers/specs/2026-09-24-landing-page-rearquitectura-rutas-design.md,
-- seccion "Modelo de datos"). Maximo una fila por (empresa_id, tipo).
CREATE TABLE public.empresa_landing_secciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('hero','nosotros','cta_carta','testimonio','galeria','visitanos')),
  activo BOOLEAN NOT NULL DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 0,
  contenido JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contenido) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo)
);

CREATE INDEX idx_empresa_landing_secciones_empresa_id ON public.empresa_landing_secciones(empresa_id);

ALTER TABLE public.empresa_landing_secciones ENABLE ROW LEVEL SECURITY;

-- AS RESTRICTIVE: se combina con AND, ninguna policy permisiva agregada
-- despues puede anularla (ver docs/context/security.md, incidente 2026-07-31).
-- El catalogo publico NO lee esta tabla directo por RLS: la landing la lee
-- via getSupabaseClient() (service_role) desde un use case, mismo patron que
-- menus_virtuales.
CREATE POLICY "No direct anon access to empresa_landing_secciones"
  ON public.empresa_landing_secciones AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve empresa_landing_secciones"
  ON public.empresa_landing_secciones FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta empresa_landing_secciones"
  ON public.empresa_landing_secciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin edita empresa_landing_secciones"
  ON public.empresa_landing_secciones FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin elimina empresa_landing_secciones"
  ON public.empresa_landing_secciones FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_landing_secciones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_landing_secciones TO authenticated;
