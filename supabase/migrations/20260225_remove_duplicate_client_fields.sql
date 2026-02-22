-- Remove duplicate client fields from pedidos (now linked via cliente_id)
ALTER TABLE public.pedidos DROP COLUMN IF EXISTS nombre_cliente;
ALTER TABLE public.pedidos DROP COLUMN IF EXISTS cliente_email;
ALTER TABLE public.pedidos DROP COLUMN IF EXISTS cliente_telefono;
