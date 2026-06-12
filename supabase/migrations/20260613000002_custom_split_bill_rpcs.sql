-- 1. claim_custom_turn
-- Atomically claims the selection lock for a sesion.
-- Cancels expired en_seleccion turns. Blocks only on active non-expired en_seleccion.
-- Returns (claimed BOOL, turno_id UUID).
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
  SELECT custom_turno_id INTO v_current_turno
  FROM public.mesa_sesiones
  WHERE id = p_sesion_id AND cerrada_at IS NULL
  FOR UPDATE;

  IF v_current_turno IS NOT NULL THEN
    SELECT status, expires_at INTO v_status, v_expires
    FROM public.mesa_pagos_personalizados WHERE id = v_current_turno;

    -- Active non-expired selection lock -> reject
    IF v_status = 'en_seleccion' AND v_expires > now() THEN
      RETURN QUERY SELECT false, NULL::UUID; RETURN;
    END IF;

    -- Expired en_seleccion -> cancel it and proceed
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

-- 2. update_custom_selection
-- Saves JSONB selection. Validates unit availability. Refreshes TTL.
-- Returns (success BOOL, error_code TEXT).
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

    SELECT COALESCE(SUM(unidades_pagadas), 0) INTO v_paid_u
    FROM public.mesa_item_pagos
    WHERE sesion_id = v_sesion_id
      AND pedido_id = (item->>'pedido_id')::UUID
      AND item_idx  = (item->>'item_idx')::INT;

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

-- 3. commit_custom_payment
-- Transitions en_seleccion -> en_pago, inserts mesa_item_pagos rows.
-- Call for Redsys (en_pago waits for webhook) and manual (call complete_custom_payment after).
-- Returns (success BOOL, error_code TEXT).
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
BEGIN
  SELECT status, sesion_id, empresa_id, seleccion
  INTO v_status, v_sesion_id, v_empresa_id, v_seleccion
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id FOR UPDATE;

  IF v_status IS NULL THEN RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN; END IF;
  IF v_status != 'en_seleccion' THEN RETURN QUERY SELECT false, 'INVALID_STATUS'; RETURN; END IF;
  IF v_seleccion IS NULL OR jsonb_array_length(v_seleccion) = 0
    THEN RETURN QUERY SELECT false, 'EMPTY_SELECTION'; RETURN; END IF;

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

-- 4. complete_custom_payment
-- Transitions en_pago -> pagado. Clears custom_turno_id. Marks sesion_pagada if all items covered.
-- Returns (success BOOL, sesion_completa BOOL, out_sesion_id UUID).
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

  UPDATE public.mesa_sesiones SET custom_turno_id = NULL WHERE id = v_sesion_id;

  -- Check if all item units in the session are now paid
  SELECT COALESCE(SUM((item->>'cantidad')::INT), 0) INTO v_total_u
  FROM public.pedidos p, jsonb_array_elements(p.detalle_pedido) AS item
  WHERE p.sesion_id = v_sesion_id AND p.empresa_id = v_empresa_id;

  SELECT COALESCE(SUM(unidades_pagadas), 0) INTO v_paid_u
  FROM public.mesa_item_pagos WHERE sesion_id = v_sesion_id;

  IF v_paid_u >= v_total_u AND v_total_u > 0 THEN
    UPDATE public.mesa_sesiones SET sesion_pagada = true WHERE id = v_sesion_id;
    UPDATE public.pedidos SET payment_status = 'paid'
    WHERE sesion_id = v_sesion_id AND empresa_id = v_empresa_id;
    RETURN QUERY SELECT true, true, v_sesion_id;
  ELSE
    RETURN QUERY SELECT true, false, v_sesion_id;
  END IF;
END;
$$;

-- 5. cancel_custom_turn
-- Cancels an en_seleccion turn and clears the lock.
-- Fails if status = en_pago (payment in flight -- cannot cancel).
-- Returns (success BOOL, error_code TEXT).
CREATE OR REPLACE FUNCTION public.cancel_custom_turn(p_turno_id UUID)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status    TEXT;
  v_sesion_id UUID;
BEGIN
  SELECT status, sesion_id INTO v_status, v_sesion_id
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id FOR UPDATE;

  IF v_status IS NULL THEN RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN; END IF;
  IF v_status = 'en_pago' THEN RETURN QUERY SELECT false, 'CANNOT_CANCEL_PAYING'; RETURN; END IF;
  IF v_status IN ('pagado','cancelado') THEN RETURN QUERY SELECT true, NULL::TEXT; RETURN; END IF;

  DELETE FROM public.mesa_item_pagos WHERE turno_id = p_turno_id;

  UPDATE public.mesa_pagos_personalizados
  SET status = 'cancelado', updated_at = now() WHERE id = p_turno_id;

  UPDATE public.mesa_sesiones
  SET custom_turno_id = NULL
  WHERE id = v_sesion_id AND custom_turno_id = p_turno_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- 6. switch_to_equal_split_remaining
-- Switches personalizado -> igual for the remaining unpaid amount.
-- Fails if there is an active en_seleccion turn.
-- Returns (success BOOL, importe_por_persona_cents INT, error_code TEXT).
CREATE OR REPLACE FUNCTION public.switch_to_equal_split_remaining(
  p_sesion_id    UUID,
  p_empresa_id   UUID,
  p_num_personas INTEGER
)
RETURNS TABLE(success BOOLEAN, importe_por_persona_cents INTEGER, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_turno_id     UUID;
  v_turno_status TEXT;
  v_total_cents  INTEGER;
  v_paid_cents   INTEGER;
  v_remaining    INTEGER;
  v_per_person   INTEGER;
BEGIN
  SELECT custom_turno_id INTO v_turno_id
  FROM public.mesa_sesiones WHERE id = p_sesion_id FOR UPDATE;

  IF v_turno_id IS NOT NULL THEN
    SELECT status INTO v_turno_status
    FROM public.mesa_pagos_personalizados WHERE id = v_turno_id;
    IF v_turno_status = 'en_seleccion' THEN
      RETURN QUERY SELECT false, 0, 'TURN_ACTIVE'; RETURN;
    END IF;
  END IF;

  SELECT COALESCE(SUM(ROUND((p.total * 100)::NUMERIC)), 0)::INTEGER
  INTO v_total_cents
  FROM public.pedidos p
  WHERE p.sesion_id = p_sesion_id AND p.empresa_id = p_empresa_id;

  SELECT COALESCE(SUM(importe_cents), 0)::INTEGER INTO v_paid_cents
  FROM public.mesa_pagos_personalizados
  WHERE sesion_id = p_sesion_id AND status = 'pagado';

  v_remaining  := v_total_cents - v_paid_cents;
  v_per_person := ROUND(v_remaining::NUMERIC / p_num_personas);

  UPDATE public.mesa_sesiones
  SET division_tipo = 'igual',
      division_personas = p_num_personas,
      division_pagos_realizados = 0,
      custom_turno_id = NULL,
      division_base_cents = v_remaining
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT true, v_per_person, NULL::TEXT;
END;
$$;
