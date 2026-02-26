-- Make email nullable in clientes table
ALTER TABLE public.clientes ALTER COLUMN email DROP NOT NULL;
