-- Migration: Trigger BEFORE INSERT en pedidos para bloquear nuevos pedidos si hay pago en curso.
-- Pieza 1 del diseño mesa-payments-atomic (docs/superpowers/specs/2026-07-29-mesa-payments-atomic-design.md).
-- Actúa como red de seguridad DB-level para la ventana sub-ms donde checkMesaPaymentLock puede leer false
-- antes de que el commit de acquire_mesa_lock haya propagado.

CREATE OR REPLACE FUNCTION public.check_session_not_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  IF NEW.sesion_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mesa_sesiones
    WHERE id = NEW.sesion_id
      AND pago_en_curso = true
      AND pago_iniciado_en > now() - interval '15 minutes'
  ) THEN
    RAISE EXCEPTION 'PAYMENT_IN_PROGRESS'
      USING HINT = 'Cannot add orders while a payment is in progress for this session';
  END IF;
  RETURN NEW;
END;
$$;

-- REVOKEs obligatorios (CLAUDE.md — SECURITY DEFINER rule).
-- Las trigger functions no necesitan EXECUTE público; el trigger engine las invoca directamente.
REVOKE EXECUTE ON FUNCTION public.check_session_not_locked() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_session_not_locked() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_session_not_locked() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_session_not_locked() TO service_role;

CREATE TRIGGER prevent_order_during_payment
BEFORE INSERT ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.check_session_not_locked();
