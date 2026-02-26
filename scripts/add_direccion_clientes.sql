-- Agregar columna direccion a la tabla clientes
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS direccion TEXT;

-- Verificar que se agregó
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clientes' AND column_name = 'direccion';
