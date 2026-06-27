-- When a pedido transitions from pendiente_validacion → pendiente (waiter validates
-- in pendientes), notify kitchen/bar AND WaiterBanner badge via broadcast.
-- This is the key event that bar/kitchen need to detect: items are now available.

CREATE OR REPLACE FUNCTION public.notify_waiter_order_validated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.estado = 'pendiente_validacion' AND NEW.estado != 'pendiente_validacion' THEN
    -- Notify bar/kitchen: new items arrived
    PERFORM realtime.send(
      jsonb_build_object('empresaId', NEW.empresa_id),
      'item-update',
      'waiter-items-update',
      FALSE
    );
    -- Notify WaiterBanner: pendientes count decreased, kitchen/bar totals changed
    PERFORM realtime.send(
      jsonb_build_object('empresaId', NEW.empresa_id),
      'new-order',
      'waiter-new-order',
      FALSE
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pedidos_notify_waiter_on_validate
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_waiter_order_validated();
