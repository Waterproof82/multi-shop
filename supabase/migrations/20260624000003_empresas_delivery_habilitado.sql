-- Add delivery_habilitado to empresas
-- Controls whether the delivery zone (zona de entrega) module is visible in the admin sidebar.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS delivery_habilitado BOOLEAN NOT NULL DEFAULT false;
