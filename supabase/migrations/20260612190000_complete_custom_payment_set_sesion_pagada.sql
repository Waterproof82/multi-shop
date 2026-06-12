-- Fix: complete_custom_payment must set sesion_pagada=true and payment_status='paid' atomically
-- when all session units are covered. Migration 000004 removed this from 000002 by mistake,
-- relying on the app layer (webhook) which is less reliable.
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
    UPDATE public.mesa_sesiones
    SET sesion_pagada = true
    WHERE id = v_sesion_id;

    UPDATE public.pedidos
    SET payment_status = 'paid'
    WHERE sesion_id = v_sesion_id AND empresa_id = v_empresa_id;

    RETURN QUERY SELECT true, true, v_sesion_id;
  ELSE
    RETURN QUERY SELECT true, false, v_sesion_id;
  END IF;
END;
$$;
