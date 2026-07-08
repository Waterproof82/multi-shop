-- Add NIF/CIF field to empresas for fiscal ticket compliance (RD 1619/2012)
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS nif TEXT;
