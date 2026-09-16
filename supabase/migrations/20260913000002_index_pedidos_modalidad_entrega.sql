-- Index para cobertura en FK pedidos.modalidad_entrega_id
-- Necesario porque pedidos es tabla caliente (dashboards, stats, cron)
CREATE INDEX idx_pedidos_modalidad_entrega_id ON public.pedidos(modalidad_entrega_id);
