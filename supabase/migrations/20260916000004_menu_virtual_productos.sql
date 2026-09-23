-- Asociación many-to-many entre un nodo HOJA de menus_virtuales y productos.
-- empresa_id denormalizado a proposito (mismo patron que producto_complemento_grupos)
-- para poder filtrar RLS y el DELETE de setProductos sin un JOIN.
CREATE TABLE public.menu_virtual_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  menu_virtual_id UUID NOT NULL REFERENCES public.menus_virtuales(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_virtual_id, producto_id)
);

CREATE INDEX idx_menu_virtual_productos_empresa_id ON public.menu_virtual_productos(empresa_id);
CREATE INDEX idx_menu_virtual_productos_producto_id ON public.menu_virtual_productos(producto_id);

ALTER TABLE public.menu_virtual_productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to menu_virtual_productos"
  ON public.menu_virtual_productos AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- get_mi_empresa_id() envuelta en (SELECT ...) para InitPlan — mismo criterio
-- que menus_virtuales (ver CLAUDE.md, seccion InitPlan).
CREATE POLICY "Admin ve menu_virtual_productos"
  ON public.menu_virtual_productos FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta menu_virtual_productos"
  ON public.menu_virtual_productos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin elimina menu_virtual_productos"
  ON public.menu_virtual_productos FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, DELETE ON public.menu_virtual_productos TO service_role;
GRANT SELECT, INSERT, DELETE ON public.menu_virtual_productos TO authenticated;
