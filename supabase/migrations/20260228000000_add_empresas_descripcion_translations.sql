-- Replace descripcion with translated versions
ALTER TABLE public.empresas 
DROP COLUMN IF EXISTS descripcion;

ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS descripcion_es TEXT NULL,
ADD COLUMN IF NOT EXISTS descripcion_en TEXT NULL,
ADD COLUMN IF NOT EXISTS descripcion_fr TEXT NULL,
ADD COLUMN IF NOT EXISTS descripcion_it TEXT NULL,
ADD COLUMN IF NOT EXISTS descripcion_de TEXT NULL;
