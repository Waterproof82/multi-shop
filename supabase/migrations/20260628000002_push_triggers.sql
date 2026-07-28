-- supabase/migrations/20260628_push_triggers.sql
-- Push notification triggers via pg_net → notify-push Edge Function
-- Sends lightweight notifications to mobile app when orders/items change

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Helper to call notify-push Edge Function via HTTP
CREATE OR REPLACE FUNCTION public.call_notify_push(empresa_id uuid, event_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Call Edge Function asynchronously via pg_net
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/notify-push',
    body := jsonb_build_object(
      'empresa_id', empresa_id::text,
      'event_type', event_type
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.anon_key')
    ),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  -- Never fail the main transaction due to push failure
  -- Log error silently (pg_net failures are non-blocking)
  NULL;
END;
$$;

-- Trigger: new order → notify waiters with 'new_order' event
CREATE OR REPLACE FUNCTION public.push_on_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'pendiente_validacion' THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'new_order');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_pedidos_new_order ON public.pedidos;
CREATE TRIGGER push_pedidos_new_order
  AFTER INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.push_on_new_order();

-- Trigger: item estado change → notify kitchen/waiter
-- Events:
--   - 'item_ready': item marked preparado (ready to serve)
--   - 'item_released': item freed from retention (from_validation false→true)
--   - 'order_validated': order enters kitchen (en_preparacion)
CREATE OR REPLACE FUNCTION public.push_on_item_estado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Item listo para servir → waiter
  IF NEW.estado = 'preparado' AND (OLD.estado IS NULL OR OLD.estado != 'preparado') THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_ready');

  -- Item liberado de retención (from_validation false→true) → kitchen
  ELSIF NEW.from_validation = true AND (OLD.from_validation IS NULL OR OLD.from_validation = false) THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_released');

  -- Item entra a cocina desde validación → kitchen
  ELSIF NEW.estado = 'en_preparacion' AND (OLD.estado IS NULL OR OLD.estado = 'pendiente') THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'order_validated');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_pedido_item_estados ON public.pedido_item_estados;
CREATE TRIGGER push_pedido_item_estados
  AFTER INSERT OR UPDATE ON public.pedido_item_estados
  FOR EACH ROW
  EXECUTE FUNCTION public.push_on_item_estado();
