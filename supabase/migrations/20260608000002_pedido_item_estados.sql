-- Per-item kitchen state tracking for cook and waiter kitchen views.
-- Each row overrides the default 'pendiente' state for a specific item
-- (identified by its 0-based index in pedidos.detalle_pedido).
-- If no row exists for (pedido_id, item_idx), the item is considered 'pendiente'.

CREATE TABLE public.pedido_item_estados (
  pedido_id  UUID        NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_idx   INTEGER     NOT NULL,
  empresa_id UUID        NOT NULL,
  estado     TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pedido_id, item_idx)
);

CREATE INDEX idx_pedido_item_estados_empresa ON public.pedido_item_estados (empresa_id);
CREATE INDEX idx_pedido_item_estados_pedido  ON public.pedido_item_estados (pedido_id);

ALTER TABLE public.pedido_item_estados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to pedido_item_estados"
  ON public.pedido_item_estados FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Authenticated ve pedido_item_estados"
  ON public.pedido_item_estados FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Authenticated inserta pedido_item_estados"
  ON public.pedido_item_estados FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Authenticated actualiza pedido_item_estados"
  ON public.pedido_item_estados FOR UPDATE TO authenticated
  USING  (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_item_estados TO service_role;
GRANT SELECT, INSERT, UPDATE          ON public.pedido_item_estados TO authenticated;
