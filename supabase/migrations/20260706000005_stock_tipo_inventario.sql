-- Extend tipo_movimiento enum to include 'inventario'
-- Used when an operator performs a physical stock count and
-- the system registers the delta between real and theoretical.
ALTER TYPE public.tipo_movimiento ADD VALUE IF NOT EXISTS 'inventario';
