-- Add cliente_id to pedidos table for normalization
ALTER TABLE public.pedidos ADD COLUMN cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;
