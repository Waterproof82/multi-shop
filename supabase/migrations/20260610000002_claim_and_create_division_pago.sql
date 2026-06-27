-- Atomic division share claim + row creation.
--
-- Replaces the read-then-write pattern in initiateRedsysMesaPaymentUseCase.
-- Uses FOR UPDATE on mesa_sesiones to serialize concurrent payers so only
-- one can pass the slot-availability check at a time — no race condition.
--
-- Returns: (claimed, amount_cents)
--   claimed = true  → slot was available; row inserted into mesa_division_pagos
--   claimed = false → no slots left (all personas already claimed or paid)
--
-- Active-claim count includes 'pending' (in-flight) + 'paid' rows, excluding
-- 'failed' ones so that a cancelled/failed payment frees its slot automatically.
CREATE OR REPLACE FUNCTION public.claim_and_create_division_pago(
  p_sesion_id           UUID,
  p_empresa_id          UUID,
  p_payment_order_ref   TEXT,
  p_session_total_cents INTEGER
)
RETURNS TABLE(claimed BOOLEAN, amount_cents INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_personas      INTEGER;
  v_active_claims BIGINT;
  v_per_person    INTEGER;
  v_amount        INTEGER;
BEGIN
  -- Lock the session row for the duration of this function — serializes concurrent payers.
  SELECT division_personas INTO v_personas
  FROM public.mesa_sesiones
  WHERE id = p_sesion_id
    AND cerrada_at IS NULL
  FOR UPDATE;

  -- Division not active, already gone, or single-person (shouldn't happen, guard anyway)
  IF v_personas IS NULL OR v_personas <= 1 THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  -- Count slots already claimed (in-flight pending + completed paid).
  -- Failed rows don't count — they free the slot for retry.
  SELECT COUNT(*) INTO v_active_claims
  FROM public.mesa_division_pagos
  WHERE sesion_id = p_sesion_id
    AND status != 'failed';

  IF v_active_claims >= v_personas THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  -- Calculate this payer's share. Last payer absorbs the rounding remainder
  -- (e.g. €10 / 3 = 3.33 + 3.33 + 3.34).
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
