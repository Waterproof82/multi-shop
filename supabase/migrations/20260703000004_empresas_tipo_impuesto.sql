-- supabase/migrations/20260703000004_empresas_tipo_impuesto.sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS tipo_impuesto       TEXT         NOT NULL DEFAULT 'iva'
    CHECK (tipo_impuesto IN ('iva', 'igic')),
  ADD COLUMN IF NOT EXISTS porcentaje_impuesto  NUMERIC(5,2) NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.empresas.tipo_impuesto IS
  'Tipo de impuesto aplicable: iva (peninsular, 10%) o igic (Canarias, 7%)';
COMMENT ON COLUMN public.empresas.porcentaje_impuesto IS
  'Porcentaje del impuesto (configurable; defecto 10 para IVA, 7 para IGIC)';
