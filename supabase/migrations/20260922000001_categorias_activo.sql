-- Add activo to categorias table, mirroring productos.activo.
-- Lets admins hide a category (and its products) from the public menu
-- without deleting it.

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
