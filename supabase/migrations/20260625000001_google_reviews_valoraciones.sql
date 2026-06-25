-- Add Google Reviews URL to empresas
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS google_reviews_url TEXT NULL;

-- Create valoraciones table
CREATE TABLE IF NOT EXISTS public.valoraciones (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mesa_id        UUID,
  mesa_sesion_id UUID,
  rater_id       UUID NOT NULL,
  estrellas      NUMERIC(2,1) NOT NULL CHECK (estrellas >= 0.5 AND estrellas <= 5.0),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- One rating per device per session
CREATE UNIQUE INDEX IF NOT EXISTS valoraciones_device_sesion_unique
  ON public.valoraciones (mesa_sesion_id, rater_id)
  WHERE mesa_sesion_id IS NOT NULL;

-- RLS
ALTER TABLE public.valoraciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "No direct anon access to valoraciones"
  ON public.valoraciones FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY IF NOT EXISTS "Admin ve valoraciones de su empresa"
  ON public.valoraciones FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- GRANTs (required per project checklist since oct 2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.valoraciones TO service_role;
GRANT SELECT ON public.valoraciones TO authenticated;
