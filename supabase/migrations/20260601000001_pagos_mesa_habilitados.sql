-- Add pagos_mesa_habilitados flag to empresas
-- Controls whether the "Pagar ahora" button is shown in the mesa ticket view
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS pagos_mesa_habilitados BOOLEAN NOT NULL DEFAULT false;
