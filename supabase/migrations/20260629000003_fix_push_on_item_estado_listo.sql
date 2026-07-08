-- Fix push_on_item_estado: two bugs corrected.
--
-- Bug 1: trigger checked NEW.estado = 'preparado' for item_ready push, but the
-- kitchen uses estado = 'listo' — 'preparado' is never set, so the push never fired.
--
-- Bug 2: the order_validated branch was calling 'item_released' instead of
-- 'order_validated', sending the wrong event type to the Edge Function.

CREATE OR REPLACE FUNCTION public.push_on_item_estado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Item listo para servir → waiter
  IF NEW.estado = 'listo' AND (OLD.estado IS NULL OR OLD.estado != 'listo') THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_ready');

  -- Item liberado de retención → kitchen
  ELSIF NEW.from_validation = true AND (OLD.from_validation IS NULL OR OLD.from_validation = false) THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_released');

  -- Item entra a cocina desde validación → kitchen
  ELSIF NEW.estado = 'en_preparacion' AND (OLD.estado IS NULL OR OLD.estado = 'pendiente') THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'order_validated');
  END IF;

  RETURN NEW;
END;
$$;
