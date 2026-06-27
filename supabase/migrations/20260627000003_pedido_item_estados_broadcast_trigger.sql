-- When pedido_item_estados rows are inserted or updated (waiter validates/advances
-- items), notify bar and kitchen screens via Supabase Broadcast. This bypasses the
-- postgres_changes routing issue that occurs when multiple channels on the same
-- singleton anon client subscribe to the same table.

CREATE OR REPLACE FUNCTION public.notify_waiter_items_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('empresaId', NEW.empresa_id, 'estado', NEW.estado),
    'item-update',
    'waiter-items-update',
    FALSE
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER pedido_item_estados_notify_waiter
  AFTER INSERT OR UPDATE ON public.pedido_item_estados
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_waiter_items_update();
