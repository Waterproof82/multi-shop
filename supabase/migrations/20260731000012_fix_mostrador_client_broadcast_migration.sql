-- Fixes a regression: MostradorClient.tsx (TPV counter view) relied on
-- postgres_changes on `pedidos` (filtered by sesion_id) and `mesa_sesiones`
-- (filtered by id) specifically because postgres_changes is CDC-based — it
-- only ever fires AFTER the underlying transaction commits, unlike the
-- item-update broadcast which can arrive while a sibling trigger
-- (fn_auto_cancel_pedido_when_all_items_cancelled) is still mid-transaction.
-- This was documented as "trampa #6" in docs/context/realtime-channels.md.
-- 20260731000004/000008 (dropping the anon SELECT policy and converting the
-- deny-all to RESTRICTIVE) broke both subscriptions for the `anon` role that
-- MostradorClient runs under — RESTRICTIVE unconditionally blocks row
-- visibility, so postgres_changes stops delivering regardless of column
-- grants.
--
-- Fix: two new triggers that broadcast ONLY once their respective UPDATE has
-- actually landed in the same transaction — same commit-safety property as
-- postgres_changes, since realtime.send() writes are ordinary transactional
-- writes (only visible/delivered once the transaction commits).

-- 1) pedidos.estado changes (covers auto-cancel and any other transition)
CREATE OR REPLACE FUNCTION public.notify_pedido_estado_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'empresaId', NEW.empresa_id,
      'sesionId', NEW.sesion_id,
      'pedidoId', NEW.id,
      'estado', NEW.estado
    ),
    'update',
    'pedido-estado-update',
    FALSE
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER pedidos_notify_estado_update
  AFTER UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_pedido_estado_update();

REVOKE EXECUTE ON FUNCTION public.notify_pedido_estado_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_pedido_estado_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_pedido_estado_update() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.notify_pedido_estado_update() TO service_role;

-- 2) Extend notify_mesa_sesion_update() payload with sesionId (=NEW.id, the
-- table's own PK) and cerradaAt — MostradorClient needs cerrada_at to detect
-- "mesa cobrada desde otro canal" (external payment closes the session).
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
      'sesionId', NEW.id,
      'pagoEnCurso', NEW.pago_en_curso,
      'sesionPagada', NEW.sesion_pagada,
      'cerradaAt', NEW.cerrada_at
    ),
    'update',
    'mesa-sesion-update',
    FALSE
  );
  RETURN NEW;
END;
$$;
