-- Fix 1: update_custom_selection — only count pagado turns for availability
CREATE OR REPLACE FUNCTION public.update_custom_selection(
  p_turno_id      UUID,
  p_seleccion     JSONB,
  p_importe_cents INTEGER
)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status    TEXT;
  v_sesion_id UUID;
  item        JSONB;
  v_total_u   INT;
  v_paid_u    INT;
BEGIN
  SELECT status, sesion_id INTO v_status, v_sesion_id
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id;

  IF v_status IS NULL    THEN RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN; END IF;
  IF v_status != 'en_seleccion' THEN RETURN QUERY SELECT false, 'INVALID_STATUS'; RETURN; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_seleccion) LOOP
    SELECT COALESCE((p.detalle_pedido->((item->>'item_idx')::INT)->>'cantidad')::INT, 0)
    INTO v_total_u
    FROM public.pedidos p
    WHERE p.id = (item->>'pedido_id')::UUID AND p.sesion_id = v_sesion_id;

    SELECT COALESCE(SUM(mip.unidades_pagadas), 0) INTO v_paid_u
    FROM public.mesa_item_pagos mip
    JOIN public.mesa_pagos_personalizados mpp ON mpp.id = mip.turno_id
    WHERE mip.sesion_id = v_sesion_id
      AND mip.pedido_id = (item->>'pedido_id')::UUID
      AND mip.item_idx  = (item->>'item_idx')::INT
      AND mpp.status    = 'pagado';

    IF (item->>'unidades')::INT > (v_total_u - v_paid_u) THEN
      RETURN QUERY SELECT false, 'ITEM_UNAVAILABLE'; RETURN;
    END IF;
  END LOOP;

  UPDATE public.mesa_pagos_personalizados
  SET seleccion = p_seleccion, importe_cents = p_importe_cents,
      updated_at = now(), expires_at = now() + interval '10 minutes'
  WHERE id = p_turno_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- Fix 2: commit_custom_payment — validate + cleanup orphaned en_pago rows
CREATE OR REPLACE FUNCTION public.commit_custom_payment(
  p_turno_id          UUID,
  p_payment_order_ref TEXT,
  p_importe_cents     INTEGER
)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status     TEXT;
  v_sesion_id  UUID;
  v_empresa_id UUID;
  v_seleccion  JSONB;
  item         JSONB;
  v_total_u    INT;
  v_paid_u     INT;
BEGIN
  SELECT status, sesion_id, empresa_id, seleccion
  INTO v_status, v_sesion_id, v_empresa_id, v_seleccion
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id FOR UPDATE;

  IF v_status IS NULL THEN RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN; END IF;
  IF v_status != 'en_seleccion' THEN RETURN QUERY SELECT false, 'INVALID_STATUS'; RETURN; END IF;
  IF v_seleccion IS NULL OR jsonb_array_length(v_seleccion) = 0
    THEN RETURN QUERY SELECT false, 'EMPTY_SELECTION'; RETURN; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(v_seleccion) LOOP
    SELECT COALESCE((p.detalle_pedido->((item->>'item_idx')::INT)->>'cantidad')::INT, 0)
    INTO v_total_u
    FROM public.pedidos p
    WHERE p.id = (item->>'pedido_id')::UUID AND p.sesion_id = v_sesion_id;

    SELECT COALESCE(SUM(mip.unidades_pagadas), 0) INTO v_paid_u
    FROM public.mesa_item_pagos mip
    JOIN public.mesa_pagos_personalizados mpp ON mpp.id = mip.turno_id
    WHERE mip.sesion_id = v_sesion_id
      AND mip.pedido_id = (item->>'pedido_id')::UUID
      AND mip.item_idx  = (item->>'item_idx')::INT
      AND mpp.status    = 'pagado';

    IF (item->>'unidades')::INT > (v_total_u - v_paid_u) THEN
      RETURN QUERY SELECT false, 'ITEM_UNAVAILABLE'; RETURN;
    END IF;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(v_seleccion) LOOP
    DELETE FROM public.mesa_item_pagos mip
    USING public.mesa_pagos_personalizados mpp
    WHERE mip.turno_id  = mpp.id
      AND mip.sesion_id = v_sesion_id
      AND mip.pedido_id = (item->>'pedido_id')::UUID
      AND mip.item_idx  = (item->>'item_idx')::INT
      AND mpp.status    IN ('en_pago', 'cancelado')
      AND mpp.id        != p_turno_id;
  END LOOP;

  UPDATE public.mesa_pagos_personalizados
  SET status = 'en_pago', payment_order_ref = p_payment_order_ref,
      importe_cents = p_importe_cents, updated_at = now()
  WHERE id = p_turno_id;

  FOR item IN SELECT * FROM jsonb_array_elements(v_seleccion) LOOP
    INSERT INTO public.mesa_item_pagos
      (sesion_id, empresa_id, pedido_id, item_idx, unidades_pagadas, importe_pagado_cents, turno_id)
    VALUES (
      v_sesion_id, v_empresa_id,
      (item->>'pedido_id')::UUID, (item->>'item_idx')::INT,
      (item->>'unidades')::INT, 0, p_turno_id
    );
  END LOOP;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- Fix 3: claim_custom_turn — cancel expired en_pago turns on new claim
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
  SET custom_turno_id = v_new_id, division_tipo = 'personalizado'
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT true, v_new_id;
END;
$$;
