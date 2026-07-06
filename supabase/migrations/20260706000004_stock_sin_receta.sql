-- Add sin_receta value to tipo_movimiento enum
ALTER TYPE public.tipo_movimiento ADD VALUE IF NOT EXISTS 'sin_receta';

-- Make ingrediente_id nullable so sin_receta rows can omit it
-- (sin_receta entries have no specific ingredient to reference)
ALTER TABLE public.movimientos_stock ALTER COLUMN ingrediente_id DROP NOT NULL;
