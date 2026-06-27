-- Enable Realtime on pedido_item_estados so kitchen/bar/pendientes can subscribe
-- to item state changes (pendiente → en_preparacion → preparado → servido/cancelado).
-- REPLICA IDENTITY FULL is required for UPDATE events to include previous row data.
ALTER TABLE public.pedido_item_estados REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_item_estados;

-- Enable Realtime on pedidos so pendientes can detect new orders immediately.
ALTER TABLE public.pedidos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
