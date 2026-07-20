-- T2: Add per-product tax rate override to productos
-- Idempotent: ADD COLUMN IF NOT EXISTS
-- porcentaje_impuesto_override: NUMERIC(5,2) NULL = inherit from empresas.porcentaje_impuesto
-- No additional RLS needed (inherits productos policies)
-- No additional GRANTs needed (already exist on productos)

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS porcentaje_impuesto_override NUMERIC(5,2) DEFAULT NULL;
