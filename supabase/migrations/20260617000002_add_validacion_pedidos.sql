-- Add opt-in validation toggle to empresas.
-- When true, customer QR orders are created with estado = 'pendiente_validacion'
-- and must be validated by a waiter before reaching the kitchen.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS validacion_pedidos_habilitada boolean NOT NULL DEFAULT false;
