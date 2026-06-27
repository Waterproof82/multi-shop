-- Add tipo_producto to categorias table
-- This moves the food/drink classification from product level to category level.
-- Categories are homogeneous (all food or all drink), so this is the natural owner.

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS tipo_producto TEXT NOT NULL DEFAULT 'comida'
  CHECK (tipo_producto IN ('comida', 'bebida'));

-- Populate from existing product data.
-- If any product in a category has tipo_producto = 'bebida', the category is 'bebida'.
UPDATE public.categorias c
SET tipo_producto = 'bebida'
WHERE EXISTS (
  SELECT 1 FROM public.productos p
  WHERE p.categoria_id = c.id AND p.tipo_producto = 'bebida'
);
