-- Modalidades de entrega configurables a mano (tipo='tienda').
-- Independiente del sistema Glovo/Redsys que usa tipo='restaurante'.

CREATE TABLE public.modalidades_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('recogida', 'domicilio')),
  icono TEXT NOT NULL,
  nombre_es TEXT NOT NULL,
  nombre_en TEXT,
  nombre_fr TEXT,
  nombre_it TEXT,
  nombre_de TEXT,
  precio_cents INT NOT NULL DEFAULT 0,
  tiempo_min_minutos INT,
  tiempo_max_minutos INT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tiempo_solo_domicilio CHECK (
    (tipo = 'recogida' AND tiempo_min_minutos IS NULL AND tiempo_max_minutos IS NULL)
    OR tipo = 'domicilio'
  )
);

CREATE INDEX idx_modalidades_entrega_empresa ON public.modalidades_entrega(empresa_id, tipo, activo);

ALTER TABLE public.modalidades_entrega ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to modalidades_entrega"
  ON public.modalidades_entrega AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve modalidades_entrega"
  ON public.modalidades_entrega FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta modalidades_entrega"
  ON public.modalidades_entrega FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin actualiza modalidades_entrega"
  ON public.modalidades_entrega FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin borra modalidades_entrega"
  ON public.modalidades_entrega FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modalidades_entrega TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modalidades_entrega TO authenticated;

-- Toggles de empresa (autoservicio del admin, no superadmin — sin credencial sensible)
ALTER TABLE public.empresas
  ADD COLUMN recogida_tienda_habilitada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN envio_domicilio_habilitado BOOLEAN NOT NULL DEFAULT false;

-- Campos nuevos en pedidos (la dirección reutiliza columnas existentes de restaurante)
ALTER TABLE public.pedidos
  ADD COLUMN modalidad_entrega_id UUID REFERENCES public.modalidades_entrega(id),
  ADD COLUMN modalidad_entrega_tipo TEXT CHECK (modalidad_entrega_tipo IN ('recogida', 'domicilio')),
  ADD COLUMN modalidad_entrega_precio_cents INT;
