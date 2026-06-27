-- Fix: set pago_en_curso=true when a custom turn is claimed so other users'
-- screens are blocked immediately via the existing Realtime+polling mechanism.
-- Clear it when the turn completes or is cancelled.

-- claim_custom_turn: also sets pago_en_curso = true, pago_iniciado_en = now()
CREATE OR REPLACE FUNCTION public.claim_custom_turn(
  p_sesion_id  UUID,
  p_empresa_id UUID
)
RETURNS TABLE(claimed BOOLEAN, turno_id UUID)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_current_turno UUID;
  v_status        TEXT;
  v_expires       TIMESTAMPTZ;
  v_new_id        UUID;
BEGIN
  UPDATE public.mesa_pagos_personalizados
  SET status = 'cancelado', updated_at = now()
  WHERE sesion_id = p_sesion_id AND status = 'en_pago' AND expires_at < now();

  SELECT custom_turno_id INTO v_current_turno
  FROM public.mesa_sesiones
  WHERE id = p_sesion_id AND cerrada_at IS NULL
  FOR UPDATE;

  IF v_current_turno IS NOT NULL THEN
    SELECT status, expires_at INTO v_status, v_expires
    FROM public.mesa_pagos_personalizados WHERE id = v_current_turno;

    IF v_status = 'en_seleccion' AND v_expires > now() THEN
      RETURN QUERY SELECT false, NULL::UUID; RETURN;
    END IF;

    IF v_status = 'en_seleccion' THEN
      UPDATE public.mesa_pagos_personalizados
      SET status = 'cancelado', updated_at = now() WHERE id = v_current_turno;
    END IF;

    UPDATE public.mesa_sesiones SET custom_turno_id = NULL WHERE id = p_sesion_id;
  END IF;

  INSERT INTO public.mesa_pagos_personalizados (sesion_id, empresa_id)
  VALUES (p_sesion_id, p_empresa_id) RETURNING id INTO v_new_id;

  UPDATE public.mesa_sesiones
  SET custom_turno_id  = v_new_id,
      division_tipo    = 'personalizado',
      pago_en_curso    = true,
      pago_iniciado_en = now()
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT true, v_new_id;
END;
$$;

-- complete_custom_payment: clears pago_en_curso after successful payment
CREATE OR REPLACE FUNCTION public.complete_custom_payment(p_turno_id UUID)
RETURNS TABLE(success BOOLEAN, sesion_completa BOOLEAN, out_sesion_id UUID)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status     TEXT;
  v_sesion_id  UUID;
  v_empresa_id UUID;
  v_total_u    INT;
  v_paid_u     INT;
BEGIN
  SELECT status, sesion_id, empresa_id
  INTO v_status, v_sesion_id, v_empresa_id
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id FOR UPDATE;

  IF v_status IS NULL OR v_status != 'en_pago' THEN
    RETURN QUERY SELECT false, false, NULL::UUID; RETURN;
  END IF;

  UPDATE public.mesa_pagos_personalizados
  SET status = 'pagado', updated_at = now() WHERE id = p_turno_id;

  UPDATE public.mesa_sesiones
  SET custom_turno_id = NULL,
      pago_en_curso   = false
  WHERE id = v_sesion_id;

  -- Check if all item units in the session are now paid
  SELECT COALESCE(SUM((item->>'cantidad')::INT), 0) INTO v_total_u
  FROM public.pedidos p, jsonb_array_elements(p.detalle_pedido) AS item
  WHERE p.sesion_id = v_sesion_id AND p.empresa_id = v_empresa_id;

  SELECT COALESCE(SUM(unidades_pagadas), 0) INTO v_paid_u
  FROM public.mesa_item_pagos WHERE sesion_id = v_sesion_id;

  IF v_total_u > 0 AND v_paid_u >= v_total_u THEN
    RETURN QUERY SELECT true, true, v_sesion_id;
  ELSE
    RETURN QUERY SELECT true, false, v_sesion_id;
  END IF;
END;
$$;

-- cancel_custom_turn: clears pago_en_curso on cancellation
CREATE OR REPLACE FUNCTION public.cancel_custom_turn(p_turno_id UUID)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status    TEXT;
  v_sesion_id UUID;
BEGIN
  SELECT status, sesion_id INTO v_status, v_sesion_id
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN;
  END IF;

  IF v_status NOT IN ('en_seleccion', 'en_pago') THEN
    RETURN QUERY SELECT false, 'INVALID_STATUS'; RETURN;
  END IF;

  UPDATE public.mesa_pagos_personalizados
  SET status = 'cancelado', updated_at = now() WHERE id = p_turno_id;

  UPDATE public.mesa_sesiones
  SET custom_turno_id = NULL,
      pago_en_curso   = false
  WHERE id = v_sesion_id AND custom_turno_id = p_turno_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;
