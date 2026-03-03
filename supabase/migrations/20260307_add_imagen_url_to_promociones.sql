-- Add imagen_url column to promociones table
ALTER TABLE public.promociones 
ADD COLUMN IF NOT EXISTS imagen_url text;
