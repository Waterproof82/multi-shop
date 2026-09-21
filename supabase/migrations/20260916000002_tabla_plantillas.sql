-- Plantillas de tabla de informacion reutilizables entre productos.
-- Guardan una copia independiente (columnas+filas); aplicar una plantilla a
-- un producto copia su contenido a productos.tabla_info, sin vinculo vivo.

CREATE TABLE public.tabla_plantillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tabla_info JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tabla_plantillas_empresa ON public.tabla_plantillas(empresa_id);

ALTER TABLE public.tabla_plantillas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to tabla_plantillas"
  ON public.tabla_plantillas AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve tabla_plantillas"
  ON public.tabla_plantillas FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta tabla_plantillas"
  ON public.tabla_plantillas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin borra tabla_plantillas"
  ON public.tabla_plantillas FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, DELETE ON public.tabla_plantillas TO service_role;
GRANT SELECT, INSERT, DELETE ON public.tabla_plantillas TO authenticated;
