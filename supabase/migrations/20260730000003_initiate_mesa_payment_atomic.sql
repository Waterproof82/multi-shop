-- Migration: RPC atómico para iniciar pago completo de mesa.
-- Pieza 2 del diseño mesa-payments-atomic (docs/superpowers/specs/2026-07-29-mesa-payments-atomic-design.md).
-- Reemplaza 3 operaciones separadas (SELECT pedidos + UPDATE pedidos x2 + UPDATE mesa_sesiones)
-- por una sola transacción con FOR UPDATE en mesa_sesiones, eliminando la ventana de race condition
-- donde un nuevo pedido podía insertarse entre acquire_mesa_lock y el cálculo del total.

CREATE OR REPLACE FUNCTION public.initiate_mesa_payment_atomic(
  p_sesion_id            UUID,
  p_empresa_id           UUID,
  p_payment_order_ref    TEXT,
  p_expected_total_cents INT,  -- 0 = skip check
  p_already_paid_cents   INT DEFAULT 0  -- para modo personalizado: total ya cobrado en turnos anteriores
)
RETURNS TABLE (
  status          TEXT,
  remaining_cents INT,   -- total_db - already_paid (lo que se cobra a Redsys, sin propina)
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
  -- 1. Bloquear fila padre. Serializa INSERTs en pedidos con esta sesion_id
  --    (cualquier INSERT necesita FOR KEY SHARE, que conflicta con FOR UPDATE).
  PERFORM 1
  FROM public.mesa_sesiones
  WHERE id = p_sesion_id
    AND cerrada_at IS NULL
  FOR UPDATE;

  -- 2. Lectura segura del total: ningún INSERT en vuelo puede colarse aquí.
  SELECT
    COALESCE(SUM(p.total), 0),
    MAX(p.numero_pedido)
  INTO v_total, v_max_num
  FROM public.pedidos p
  WHERE p.sesion_id = p_sesion_id
    AND p.empresa_id = p_empresa_id;

  IF v_max_num IS NULL THEN
    RETURN QUERY SELECT 'no_orders'::TEXT, 0, NULL::UUID;
    RETURN;
  END IF;

  v_total_cents := ROUND(v_total * 100)::INT;
  v_remaining   := GREATEST(0, v_total_cents - p_already_paid_cents);

  -- 3. Validar total esperado (skip si p_expected_total_cents = 0).
  --    Se compara con v_remaining (no con v_total_cents) para ser consistente
  --    con lo que el cliente calcula en modo personalizado.
  IF p_expected_total_cents > 0 AND ABS(v_remaining - p_expected_total_cents) > 1 THEN
    RETURN QUERY SELECT 'total_mismatch'::TEXT, v_remaining, NULL::UUID;
    RETURN;
  END IF;

  -- 4. Obtener el pedido anchor (mayor numero_pedido).
  SELECT id INTO v_anchor_id
  FROM public.pedidos
  WHERE sesion_id = p_sesion_id
    AND empresa_id = p_empresa_id
    AND numero_pedido = v_max_num
  LIMIT 1;

  -- 5. Marcar todos los pedidos de la sesión como pending.
  UPDATE public.pedidos
  SET payment_status = 'pending'
  WHERE sesion_id = p_sesion_id
    AND empresa_id = p_empresa_id;

  -- 6. Anotar payment_order_ref y amount en el pedido anchor.
  --    payment_amount_cents = v_remaining (sin propina; la propina se suma en el use case).
  UPDATE public.pedidos
  SET payment_order_ref    = p_payment_order_ref,
      payment_amount_cents = v_remaining
  WHERE id = v_anchor_id;

  -- 7. Activar el lock DENTRO de la transacción.
  --    Crítico: cuando el FOR UPDATE se libere al hacer commit,
  --    pago_en_curso ya es true. El trigger check_session_not_locked
  --    lo leerá y rechazará cualquier INSERT pendiente.
  UPDATE public.mesa_sesiones
  SET pago_en_curso    = true,
      pago_iniciado_en = now()
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_remaining, v_anchor_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) TO service_role;
