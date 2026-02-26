-- Add parent category support for subcategories
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS categoria_padre_id UUID REFERENCES categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categorias_categoria_padre_id ON categorias(categoria_padre_id);
