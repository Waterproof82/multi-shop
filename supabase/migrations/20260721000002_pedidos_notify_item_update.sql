-- Broadcast item-update when a pedido row is deleted or its items/total are updated directly.
-- This covers removeSessionItemUseCase (waiter ticket view) which bypasses
-- pedido_item_estados, so the existing pedido_item_estados trigger never fires.
-- Without this, the TPV mesa grid and WaiterBanner stay stale after item removal.

CREATE OR REPLACE FUNCTION public.notify_pedido_removed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  v_empresa_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.empresa_id ELSE NEW.empresa_id END;

  PERFORM realtime.send(
    jsonb_build_object('empresaId', v_empresa_id, 'estado', 'removed'),
    'item-update',
    'waiter-items-update',
    FALSE
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Fire only on DELETE or when detalle_pedido/total columns actually change (UPDATE OF).
-- This avoids spurious broadcasts on estado changes or other unrelated pedido updates.
CREATE TRIGGER pedidos_notify_item_update
  AFTER DELETE OR UPDATE OF detalle_pedido, total ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_pedido_removed();
