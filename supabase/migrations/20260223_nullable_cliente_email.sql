-- Make cliente_email nullable in pedidos table
ALTER TABLE public.pedidos ALTER COLUMN cliente_email DROP NOT NULL;
