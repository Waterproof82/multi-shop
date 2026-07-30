-- Migration: Hardening de superficie de API para el sistema de pagos de mesa.
-- Cierra BAJA-01 y BAJA-03 del security audit 2026-07-30.
--
-- BAJA-01: acquire_mesa_lock, claim_and_create_division_pago, claim_custom_turn
--   son SECURITY INVOKER y estaban expuestos via /rest/v1/rpc/* a anon y authenticated.
--   Aunque el daño real está mitigado por RLS, la exposición es innecesaria —
--   los tres RPCs solo se invocan desde Next.js con service_role.
--
-- BAJA-03: initiate_mesa_payment_atomic no validaba que p_empresa_id coincidiera
--   con mesa_sesiones.empresa_id. Añadimos tenant_mismatch check en step 1.

-- ============================================================
-- BAJA-01: Revocar acceso a RPCs de mesa desde PUBLIC/anon/authenticated
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.acquire_mesa_lock(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.acquire_mesa_lock(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acquire_mesa_lock(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.acquire_mesa_lock(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_and_create_division_pago(UUID, UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_and_create_division_pago(UUID, UUID, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_and_create_division_pago(UUID, UUID, TEXT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_and_create_division_pago(UUID, UUID, TEXT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_custom_turn(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_custom_turn(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_custom_turn(UUID, UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_custom_turn(UUID, UUID) TO service_role;

-- ============================================================
-- BAJA-03: Añadir tenant isolation check en initiate_mesa_payment_atomic
-- ============================================================

CREATE OR REPLACE FUNCTION public.initiate_mesa_payment_atomic(
  p_sesion_id            UUID,
  p_empresa_id           UUID,
  p_payment_order_ref    TEXT,
  p_expected_total_cents INT,
  p_already_paid_cents   INT DEFAULT 0
)
RETURNS TABLE (
  status          TEXT,
  remaining_cents INT,
  anchor_pedido_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_total       NUMERIC := 0;
  v_total_cents INT;
  v_remaining   INT;
  v_anchor_id   UUID;
  v_max_num     INT;
BEGIN
  -- 1. Bloquear fila padre. Serializa INSERTs en pedidos con esta sesion_id.
  --    Valida tenant: empresa_id debe coincidir con el parámetro — defense in depth
  --    aunque el caller (service_role) siempre provee valores correctos.
  PERFORM 1
  FROM public.mesa_sesiones
  WHERE id          = p_sesion_id
    AND empresa_id  = p_empresa_id
    AND cerrada_at IS NULL
  FOR UPDATE;

  -- Si el FOR UPDATE no encontró filas (sesión no existe, cerrada, o tenant mismatch)
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'tenant_mismatch'::TEXT, 0, NULL::UUID;
    RETURN;
  END IF;

  -- 2. Lectura segura del total: ningún INSERT en vuelo puede colarse aquí.
  SELECT
    COALESCE(SUM(p.total), 0),
    MAX(p.numero_pedido)
  INTO v_total, v_max_num
  FROM public.pedidos p
  WHERE p.sesion_id  = p_sesion_id
    AND p.empresa_id = p_empresa_id;

  IF v_max_num IS NULL THEN
    RETURN QUERY SELECT 'no_orders'::TEXT, 0, NULL::UUID;
    RETURN;
  END IF;

  v_total_cents := ROUND(v_total * 100)::INT;
  v_remaining   := GREATEST(0, v_total_cents - p_already_paid_cents);

  -- 3. Validar total esperado (skip si p_expected_total_cents = 0).
  IF p_expected_total_cents > 0 AND ABS(v_remaining - p_expected_total_cents) > 1 THEN
    RETURN QUERY SELECT 'total_mismatch'::TEXT, v_remaining, NULL::UUID;
    RETURN;
  END IF;

  -- 4. Obtener el pedido anchor (mayor numero_pedido).
  SELECT id INTO v_anchor_id
  FROM public.pedidos
  WHERE sesion_id  = p_sesion_id
    AND empresa_id = p_empresa_id
    AND numero_pedido = v_max_num
  LIMIT 1;

  -- 5. Marcar todos los pedidos de la sesión como pending.
  UPDATE public.pedidos
  SET payment_status = 'pending'
  WHERE sesion_id  = p_sesion_id
    AND empresa_id = p_empresa_id;

  -- 6. Anotar payment_order_ref y amount en el pedido anchor.
  UPDATE public.pedidos
  SET payment_order_ref    = p_payment_order_ref,
      payment_amount_cents = v_remaining
  WHERE id = v_anchor_id;

  -- 7. Activar el lock DENTRO de la transacción.
  UPDATE public.mesa_sesiones
  SET pago_en_curso    = true,
      pago_iniciado_en = now()
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_remaining, v_anchor_id;
END;
$$;

-- REVOKEs: función ya tenía REVOKE/GRANT correcto; repetimos para idempotencia.
REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) TO service_role;
