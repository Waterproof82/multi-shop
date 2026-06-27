-- When a client places a new mesa order (estado='pendiente_validacion'), the
-- postgres_changes subscription can be unreliable when multiple Supabase JS
-- channels on the same singleton client subscribe to the same table.
--
-- This trigger uses realtime.send() (Supabase Broadcast) to emit a lightweight
-- wake-up event on the 'waiter-new-order' channel. WaiterBanner subscribes to
-- this broadcast channel and calls fetchCounts() + dispatches the DOM relay
-- event so all waiter screens update instantly.
--
-- Broadcast is 100% reliable: it fires at the DB level, bypasses WAL routing
-- entirely, and does not require any application code changes in the API route.

CREATE OR REPLACE FUNCTION public.notify_waiter_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'pendiente_validacion' THEN
    PERFORM realtime.send(
      jsonb_build_object('empresaId', NEW.empresa_id),
      'new-order',
      'waiter-new-order',
      FALSE  -- public channel (no auth required to subscribe)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pedidos_notify_waiter_on_insert
  AFTER INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_waiter_new_order();
