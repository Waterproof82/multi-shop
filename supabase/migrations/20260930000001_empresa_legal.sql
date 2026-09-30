-- Datos legales por tenant para las páginas /aviso-legal, /condiciones,
-- /envios-y-pagos y /devoluciones. 1:1 con empresas. Sin fila = defaults
-- (las páginas funcionan aunque el admin no haya rellenado nada).
-- Los CHECK replican los suelos del TRLGDCU que también valida Zod: la BD es
-- la última barrera si alguien escribe fuera de la API.

CREATE TABLE public.empresa_legal (
  empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  registro_mercantil TEXT CHECK (char_length(registro_mercantil) <= 300),
  email_legal TEXT CHECK (char_length(email_legal) <= 254),
  direccion_devoluciones TEXT CHECK (char_length(direccion_devoluciones) <= 300),
  plazo_desistimiento_dias INT NOT NULL DEFAULT 14 CHECK (plazo_desistimiento_dias BETWEEN 14 AND 365),
  gastos_devolucion TEXT NOT NULL DEFAULT 'cliente' CHECK (gastos_devolucion IN ('cliente', 'empresa')),
  plazo_preparacion_dias INT CHECK (plazo_preparacion_dias BETWEEN 0 AND 60),
  plazo_aviso_danos_horas INT CHECK (plazo_aviso_danos_horas BETWEEN 1 AND 720),
  garantias JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(garantias) = 'array'),
  exclusiones_desistimiento JSONB NOT NULL DEFAULT '{"supuestos":[],"otras":null}'::jsonb
    CHECK (jsonb_typeof(exclusiones_desistimiento) = 'object'),
  adicional_aviso_legal TEXT CHECK (char_length(adicional_aviso_legal) <= 2000),
  adicional_condiciones TEXT CHECK (char_length(adicional_condiciones) <= 2000),
  adicional_envios TEXT CHECK (char_length(adicional_envios) <= 2000),
  adicional_devoluciones TEXT CHECK (char_length(adicional_devoluciones) <= 2000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.empresa_legal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to empresa_legal"
  ON public.empresa_legal AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve empresa_legal"
  ON public.empresa_legal FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta empresa_legal"
  ON public.empresa_legal FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin actualiza empresa_legal"
  ON public.empresa_legal FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin borra empresa_legal"
  ON public.empresa_legal FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_legal TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_legal TO authenticated;
