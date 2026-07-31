-- Adds the missing Broadcast trigger for mesa_sesiones, mirroring the existing,
-- already-proven pattern used for pedidos/pedido_item_estados
-- (notify_waiter_new_order, notify_waiter_items_update — see
-- 20260627000003/20260627000004). This is purely additive: it does not touch
-- the current RLS policies, so it is safe to deploy ahead of the frontend
-- change that will consume it. Once the frontend is updated to subscribe to
-- this broadcast channel instead of postgres_changes on mesa_sesiones, the
-- permissive anon SELECT policy on mesa_sesiones (and on pedidos /
-- pedido_item_estados, already covered by existing broadcast triggers) can be
-- dropped — see 20260731000004_drop_anon_realtime_select_policies.sql.

CREATE OR REPLACE FUNCTION public.notify_mesa_sesion_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'empresaId', NEW.empresa_id,
      'mesaId', NEW.mesa_id,
      'pagoEnCurso', NEW.pago_en_curso,
      'sesionPagada', NEW.sesion_pagada
    ),
    'update',
    'mesa-sesion-update',
    FALSE  -- public channel (no auth required to subscribe), same convention as waiter-new-order/waiter-items-update
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER mesa_sesiones_notify_update
  AFTER INSERT OR UPDATE ON public.mesa_sesiones
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_mesa_sesion_update();
