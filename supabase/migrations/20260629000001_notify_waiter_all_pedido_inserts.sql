-- Extend notify_waiter_new_order to fire for ALL new pedido inserts, not only
-- pendiente_validacion. When a waiter places an order directly (estado='pendiente'
-- or 'retenido'), the previous trigger was silent — kitchen and bar had no reliable
-- broadcast wake-up, and postgres_changes on the singleton client is known to be
-- unreliable when multiple channels subscribe to the same table.
--
-- Removing the estado condition ensures that WaiterBanner (which subscribes to
-- 'waiter-new-order') always receives the broadcast, calls fetchCounts(), and
-- dispatches the 'waiter-realtime-update' DOM relay so all waiter screens refresh.

CREATE OR REPLACE FUNCTION public.notify_waiter_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('empresaId', NEW.empresa_id),
    'new-order',
    'waiter-new-order',
    FALSE
  );
  RETURN NEW;
END;
$$;
