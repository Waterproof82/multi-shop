-- Add idioma field to clientes table for email localization
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS idioma TEXT DEFAULT 'es' CHECK (idioma IN ('es', 'en', 'fr', 'it', 'de'));

-- Update RLS policies to allow selecting idioma
DROP POLICY IF EXISTS "Public can select idioma" ON clientes;
CREATE POLICY "Public can select idioma" ON clientes FOR SELECT USING (true);

-- Update existing clients to have 'es' as default idioma where NULL
UPDATE clientes SET idioma = 'es' WHERE idioma IS NULL;
