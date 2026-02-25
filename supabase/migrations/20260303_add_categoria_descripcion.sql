-- Add description columns to categorias table
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descripcion_es TEXT;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descripcion_en TEXT;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descripcion_fr TEXT;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descripcion_it TEXT;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descripcion_de TEXT;
