-- ============================================================================
-- Security hardening
-- Fixes three Supabase advisor categories:
--   1. function_search_path_mutable  → SET search_path = 'public' on all functions
--   2. rls_policy_always_true        → Scope productos foto policies to tenant
--   3. anon/authenticated_security_definer_function_executable
--                                    → REVOKE EXECUTE from PUBLIC, GRANT to service_role
-- ============================================================================

-- ============================================================================
-- PART 1A: SECURITY DEFINER functions — add SET search_path = 'public'
-- (functions that were missing it)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_tgtg_cupon(
  p_item_id uuid, p_email text, p_nombre text,
  p_token text, p_tgtg_promo_id uuid, p_empresa_id uuid
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM tgtg_reservas WHERE token = p_token) THEN
    RETURN QUERY SELECT false, 'token_used';
    RETURN;
  END IF;

  UPDATE tgtg_items
  SET cupones_disponibles = cupones_disponibles - 1
  WHERE id = p_item_id AND cupones_disponibles > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN QUERY SELECT false, 'no_cupones';
    RETURN;
  END IF;

  INSERT INTO tgtg_reservas (item_id, tgtg_promo_id, empresa_id, email, nombre, token)
  VALUES (p_item_id, p_tgtg_promo_id, p_empresa_id, p_email, p_nombre, p_token);

  RETURN QUERY SELECT true, 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.close_mesa_sesion(p_sesion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total NUMERIC(10,2);
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_total
  FROM pedidos
  WHERE sesion_id = p_sesion_id;

  UPDATE mesa_sesiones
  SET cerrada_at = now(), total = v_total
  WHERE id = p_sesion_id AND cerrada_at IS NULL;

  UPDATE mesas SET sesion_id = NULL
  WHERE sesion_id = p_sesion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mesas_with_sessions(p_empresa_id uuid)
RETURNS TABLE(
  id uuid, empresa_id uuid, numero integer, nombre text,
  sesion_id uuid, sesion_pagada boolean, pago_en_curso boolean,
  session_total numeric, cliente_activo boolean,
  division_activa boolean, llamada_activa boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    m.id,
    m.empresa_id,
    m.numero,
    m.nombre,
    ms.id                                             AS sesion_id,
    COALESCE(ms.sesion_pagada,   false)               AS sesion_pagada,
    COALESCE(ms.pago_en_curso,   false)               AS pago_en_curso,
    GREATEST(
      COALESCE((
        SELECT SUM(p.total)
        FROM pedidos p
        WHERE p.sesion_id = ms.id
      ), 0)
      - COALESCE((
        SELECT SUM(
          ((d.item->>'precio')::NUMERIC) * ((d.item->>'cantidad')::NUMERIC)
        )
        FROM pedidos p2
        JOIN pedido_item_estados pie
          ON pie.pedido_id = p2.id
         AND pie.estado = 'cancelado'
        CROSS JOIN LATERAL (
          SELECT elem AS item, (pos - 1)::INT AS idx
          FROM jsonb_array_elements(p2.detalle_pedido)
            WITH ORDINALITY AS t(elem, pos)
        ) d
        WHERE p2.sesion_id = ms.id
          AND pie.item_idx = d.idx
      ), 0),
      0
    )                                                 AS session_total,
    COALESCE(ms.cliente_activo,  false)               AS cliente_activo,
    (ms.division_personas IS NOT NULL)                AS division_activa,
    COALESCE(ms.llamada_activa,  false)               AS llamada_activa
  FROM       mesas        m
  LEFT JOIN  mesa_sesiones ms ON ms.id = m.sesion_id
  WHERE m.empresa_id = p_empresa_id
  ORDER BY m.numero ASC;
$$;

CREATE OR REPLACE FUNCTION public.increment_division_pagos(p_sesion_id uuid)
RETURNS TABLE(pagos_realizados integer, personas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE mesa_sesiones
  SET division_pagos_realizados = division_pagos_realizados + 1
  WHERE id = p_sesion_id;

  RETURN QUERY
  SELECT
    ms.division_pagos_realizados AS pagos_realizados,
    ms.division_personas         AS personas
  FROM mesa_sesiones ms
  WHERE ms.id = p_sesion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_mesa_sesion(p_mesa_id uuid, p_empresa_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_sesion_id UUID;
  v_existing  UUID;
BEGIN
  SELECT sesion_id INTO v_existing FROM mesas WHERE id = p_mesa_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO mesa_sesiones (mesa_id, empresa_id)
  VALUES (p_mesa_id, p_empresa_id)
  RETURNING id INTO v_sesion_id;

  UPDATE mesas SET sesion_id = v_sesion_id WHERE id = p_mesa_id;

  RETURN v_sesion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tpv_analytics_kpis(p_empresa_id uuid, p_desde date, p_hasta date)
RETURNS TABLE(
  total_facturado bigint, num_cobros bigint, total_iva bigint,
  base_imponible bigint, total_propina bigint, efectivo bigint, tarjeta bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    COALESCE(SUM(importe_cobrado_cents), 0)::BIGINT,
    COUNT(*)::BIGINT,
    COALESCE(SUM(iva_cents), 0)::BIGINT,
    COALESCE(SUM(base_imponible_cents), 0)::BIGINT,
    COALESCE(SUM(propina_cents), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN importe_cobrado_cents ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN metodo_pago = 'tarjeta'  THEN importe_cobrado_cents ELSE 0 END), 0)::BIGINT
  FROM public.tpv_cobros
  WHERE empresa_id          = p_empresa_id
    AND cobrado_at         >= p_desde::timestamptz
    AND cobrado_at          < (p_hasta + interval '1 day')::timestamptz
    AND rectifica_cobro_id IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.tpv_analytics_por_hora(p_empresa_id uuid, p_desde date, p_hasta date)
RETURNS TABLE(hora integer, total bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    EXTRACT(hour FROM cobrado_at AT TIME ZONE 'Europe/Madrid')::INT AS hora,
    COALESCE(SUM(importe_cobrado_cents), 0)::BIGINT                 AS total
  FROM public.tpv_cobros
  WHERE empresa_id          = p_empresa_id
    AND cobrado_at         >= p_desde::timestamptz
    AND cobrado_at          < (p_hasta + interval '1 day')::timestamptz
    AND rectifica_cobro_id IS NULL
  GROUP BY hora
  ORDER BY hora;
$$;

CREATE OR REPLACE FUNCTION public.tpv_analytics_top_productos(p_empresa_id uuid, p_desde date, p_hasta date)
RETURNS TABLE(nombre text, cantidad bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    elem->>'nombre'                       AS nombre,
    SUM((elem->>'cantidad')::int)::BIGINT AS cantidad
  FROM public.pedidos,
       jsonb_array_elements(detalle_pedido) AS elem
  WHERE empresa_id  = p_empresa_id
    AND created_at >= p_desde::timestamptz
    AND created_at  < (p_hasta + interval '1 day')::timestamptz
    AND estado     != 'cancelado'
  GROUP BY nombre
  ORDER BY cantidad DESC
  LIMIT 10;
$$;

-- ============================================================================
-- PART 1B: SECURITY INVOKER functions — add SET search_path = 'public'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.acquire_mesa_lock(p_mesa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.mesa_sesiones
  SET
    pago_en_curso    = true,
    pago_iniciado_en = now()
  WHERE mesa_id    = p_mesa_id
    AND cerrada_at IS NULL
    AND (
      pago_en_curso = false
      OR pago_iniciado_en IS NULL
      OR pago_iniciado_en < (now() - interval '15 minutes')
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_custom_turn(p_turno_id uuid)
RETURNS TABLE(success boolean, error_code text)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
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

  DELETE FROM public.mesa_item_pagos WHERE turno_id = p_turno_id;

  UPDATE public.mesa_pagos_personalizados
  SET status = 'cancelado', updated_at = now() WHERE id = p_turno_id;

  UPDATE public.mesa_sesiones
  SET custom_turno_id = NULL,
      pago_en_curso   = false
  WHERE id = v_sesion_id AND custom_turno_id = p_turno_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_and_create_division_pago(
  p_sesion_id uuid, p_empresa_id uuid,
  p_payment_order_ref text, p_session_total_cents integer
)
RETURNS TABLE(claimed boolean, amount_cents integer)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_personas      INTEGER;
  v_active_claims BIGINT;
  v_per_person    INTEGER;
  v_amount        INTEGER;
BEGIN
  SELECT division_personas INTO v_personas
  FROM public.mesa_sesiones
  WHERE id = p_sesion_id
    AND cerrada_at IS NULL
  FOR UPDATE;

  IF v_personas IS NULL OR v_personas <= 1 THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_active_claims
  FROM public.mesa_division_pagos
  WHERE sesion_id = p_sesion_id
    AND status != 'failed';

  IF v_active_claims >= v_personas THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  v_per_person := ROUND(p_session_total_cents::NUMERIC / v_personas);
  IF v_active_claims + 1 = v_personas THEN
    v_amount := p_session_total_cents - v_per_person * (v_personas - 1);
  ELSE
    v_amount := v_per_person;
  END IF;

  INSERT INTO public.mesa_division_pagos
    (sesion_id, empresa_id, payment_order_ref, payment_amount_cents, status)
  VALUES
    (p_sesion_id, p_empresa_id, p_payment_order_ref, v_amount, 'pending');

  RETURN QUERY SELECT true, v_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_custom_turn(p_sesion_id uuid, p_empresa_id uuid)
RETURNS TABLE(claimed boolean, turno_id uuid)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_current_turno UUID;
  v_status        TEXT;
  v_expires       TIMESTAMPTZ;
  v_new_id        UUID;
BEGIN
  DELETE FROM public.mesa_item_pagos AS mip
  WHERE mip.turno_id IN (
    SELECT id FROM public.mesa_pagos_personalizados
    WHERE sesion_id = p_sesion_id AND status = 'en_pago' AND expires_at < now()
  );

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

CREATE OR REPLACE FUNCTION public.commit_custom_payment(
  p_turno_id uuid, p_payment_order_ref text, p_importe_cents integer
)
RETURNS TABLE(success boolean, error_code text)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
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

CREATE OR REPLACE FUNCTION public.complete_custom_payment(p_turno_id uuid)
RETURNS TABLE(success boolean, sesion_completa boolean, out_sesion_id uuid)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
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

  SELECT COALESCE(SUM((item->>'cantidad')::INT), 0) INTO v_total_u
  FROM public.pedidos p, jsonb_array_elements(p.detalle_pedido) AS item
  WHERE p.sesion_id = v_sesion_id AND p.empresa_id = v_empresa_id;

  SELECT COALESCE(SUM(mip.unidades_pagadas), 0) INTO v_paid_u
  FROM public.mesa_item_pagos mip
  JOIN public.mesa_pagos_personalizados mpp ON mpp.id = mip.turno_id
  WHERE mip.sesion_id = v_sesion_id
    AND mpp.status = 'pagado';

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

CREATE OR REPLACE FUNCTION public.push_on_item_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.estado = 'listo' AND (OLD.estado IS NULL OR OLD.estado != 'listo') THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_ready');

  ELSIF NEW.from_validation = true AND (OLD.from_validation IS NULL OR OLD.from_validation = false) THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_released');

  ELSIF NEW.estado = 'pendiente' AND OLD.estado = 'retenido' AND NEW.from_validation = false THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_released');

  ELSIF NEW.estado = 'en_preparacion' AND (OLD.estado IS NULL OR OLD.estado = 'pendiente') THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'order_validated');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_on_pedido_validated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.estado = 'pendiente' AND OLD.estado = 'pendiente_validacion' THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'order_validated');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_to_equal_split_remaining(
  p_sesion_id uuid, p_empresa_id uuid, p_num_personas integer
)
RETURNS TABLE(success boolean, importe_por_persona_cents integer, error_code text)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
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

  IF p_num_personas <= 0 THEN
    RETURN QUERY SELECT false, 0, 'INVALID_PERSONAS'; RETURN;
  END IF;

  v_remaining  := v_total_cents - v_paid_cents;
  v_per_person := ROUND(v_remaining::NUMERIC / p_num_personas);

  UPDATE public.mesa_sesiones
  SET division_tipo             = 'igual',
      division_personas         = p_num_personas,
      division_pagos_realizados = 0,
      custom_turno_id           = NULL,
      division_base_cents       = v_remaining
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT true, v_per_person, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.tpv_cobro_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  prev_row       RECORD;
  importe_neto   INTEGER;
  payload        TEXT;
BEGIN
  SELECT numero_ticket, hash
    INTO prev_row
    FROM public.tpv_cobros
   WHERE empresa_id = NEW.empresa_id
   ORDER BY numero_ticket DESC
   LIMIT 1
   FOR UPDATE;

  NEW.numero_ticket := COALESCE(prev_row.numero_ticket, 0) + 1;
  NEW.hash_anterior := prev_row.hash;

  importe_neto             := NEW.importe_cobrado_cents - NEW.propina_cents;
  NEW.base_imponible_cents := ROUND(importe_neto::NUMERIC / (1 + NEW.iva_porcentaje / 100));
  NEW.iva_cents            := importe_neto - NEW.base_imponible_cents;

  payload := NEW.serie                                                    || '|' ||
             NEW.empresa_id::TEXT                                         || '|' ||
             NEW.numero_ticket::TEXT                                      || '|' ||
             NEW.importe_cobrado_cents::TEXT                              || '|' ||
             NEW.metodo_pago                                              || '|' ||
             to_char(NEW.cobrado_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')       || '|' ||
             COALESCE(NEW.hash_anterior, 'INICIO');

  NEW.hash := encode(digest(payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tpv_cobro_block_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'tpv_cobros: DELETE no permitido (cumplimiento fiscal RD 1619/2012)';
END;
$$;

CREATE OR REPLACE FUNCTION public.tpv_cobro_block_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.numero_ticket         <> NEW.numero_ticket                              OR
     OLD.importe_cobrado_cents <> NEW.importe_cobrado_cents                      OR
     OLD.metodo_pago           <> NEW.metodo_pago                                OR
     OLD.hash                  <> NEW.hash                                       OR
     OLD.empresa_id            <> NEW.empresa_id                                 OR
     (OLD.rectifica_cobro_id IS DISTINCT FROM NEW.rectifica_cobro_id) THEN
    RAISE EXCEPTION 'tpv_cobros: campos fiscales inmutables (RD 1619/2012)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_custom_selection(
  p_turno_id uuid, p_seleccion jsonb, p_importe_cents integer
)
RETURNS TABLE(success boolean, error_code text)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_status    TEXT;
  v_sesion_id UUID;
  item        JSONB;
  v_total_u   INT;
  v_paid_u    INT;
BEGIN
  SELECT status, sesion_id INTO v_status, v_sesion_id
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id;

  IF v_status IS NULL         THEN RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN; END IF;
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
  SET seleccion     = p_seleccion,
      importe_cents = p_importe_cents,
      updated_at    = now(),
      expires_at    = now() + interval '10 minutes'
  WHERE id = p_turno_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- ============================================================================
-- PART 2: Fix overly-permissive RLS policies on productos
-- (rls_policy_always_true advisory)
-- ============================================================================

DROP POLICY IF EXISTS "Allow insert foto_object_fit" ON public.productos;
CREATE POLICY "Allow insert foto_object_fit"
  ON public.productos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

DROP POLICY IF EXISTS "Allow update foto_object_fit" ON public.productos;
CREATE POLICY "Allow update foto_object_fit"
  ON public.productos FOR UPDATE TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- ============================================================================
-- PART 3: Restrict EXECUTE on SECURITY DEFINER functions
-- Revoke from PUBLIC, grant only to service_role (+ authenticated for get_mi_empresa_id).
-- All .rpc() calls in this codebase are server-side via service_role — safe to revoke.
-- ============================================================================

-- call_notify_push
REVOKE EXECUTE ON FUNCTION public.call_notify_push(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.call_notify_push(uuid, text) TO service_role;

-- claim_tgtg_cupon
REVOKE EXECUTE ON FUNCTION public.claim_tgtg_cupon(uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_tgtg_cupon(uuid, text, text, text, uuid, uuid) TO service_role;

-- close_mesa_sesion
REVOKE EXECUTE ON FUNCTION public.close_mesa_sesion(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.close_mesa_sesion(uuid) TO service_role;

-- deducir_stock_on_servido (trigger — not callable via RPC but revoke PUBLIC anyway)
REVOKE EXECUTE ON FUNCTION public.deducir_stock_on_servido() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deducir_stock_on_servido() TO service_role;

-- get_mesas_with_sessions
REVOKE EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid) TO service_role;

-- get_mi_empresa_id — keep authenticated (used in RLS policies)
REVOKE EXECUTE ON FUNCTION public.get_mi_empresa_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_mi_empresa_id() TO service_role;
GRANT  EXECUTE ON FUNCTION public.get_mi_empresa_id() TO authenticated;

-- increment_division_pagos
REVOKE EXECUTE ON FUNCTION public.increment_division_pagos(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_division_pagos(uuid) TO service_role;

-- notify_waiter_items_update (trigger)
REVOKE EXECUTE ON FUNCTION public.notify_waiter_items_update() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.notify_waiter_items_update() TO service_role;

-- notify_waiter_new_order (trigger)
REVOKE EXECUTE ON FUNCTION public.notify_waiter_new_order() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.notify_waiter_new_order() TO service_role;

-- notify_waiter_order_validated (trigger)
REVOKE EXECUTE ON FUNCTION public.notify_waiter_order_validated() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.notify_waiter_order_validated() TO service_role;

-- open_mesa_sesion
REVOKE EXECUTE ON FUNCTION public.open_mesa_sesion(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.open_mesa_sesion(uuid, uuid) TO service_role;

-- push_on_new_order (trigger)
REVOKE EXECUTE ON FUNCTION public.push_on_new_order() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.push_on_new_order() TO service_role;

-- stock_update_cantidad
REVOKE EXECUTE ON FUNCTION public.stock_update_cantidad(uuid, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.stock_update_cantidad(uuid, numeric) TO service_role;

-- tpv_analytics_kpis
REVOKE EXECUTE ON FUNCTION public.tpv_analytics_kpis(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.tpv_analytics_kpis(uuid, date, date) TO service_role;

-- tpv_analytics_por_hora
REVOKE EXECUTE ON FUNCTION public.tpv_analytics_por_hora(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.tpv_analytics_por_hora(uuid, date, date) TO service_role;

-- tpv_analytics_top_productos
REVOKE EXECUTE ON FUNCTION public.tpv_analytics_top_productos(uuid, date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.tpv_analytics_top_productos(uuid, date, date) TO service_role;
