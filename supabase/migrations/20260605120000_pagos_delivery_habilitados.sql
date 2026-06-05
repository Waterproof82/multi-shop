ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS pagos_delivery_habilitados boolean NOT NULL DEFAULT false;
