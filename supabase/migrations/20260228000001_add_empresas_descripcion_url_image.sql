-- Add descripcion and url_image to empresas table
ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS descripcion TEXT NULL,
ADD COLUMN IF NOT EXISTS url_image TEXT NULL;
