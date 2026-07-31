-- Defense-in-depth consistency fix: initiate_mesa_payment_atomic already
-- validates p_empresa_id against mesa_sesiones.empresa_id (BAJA-03,
-- 20260730000004). claim_and_create_division_pago — its sibling RPC for the
-- division-payment path — never got the same check: it looks up
-- mesa_sesiones by p_sesion_id alone (no empresa filter) and inserts the
-- resulting mesa_division_pagos row with whatever p_empresa_id was passed,
-- with no verification it actually matches the session's real tenant.
--
-- Not currently exploitable: the only caller
-- (initiateRedsysMesaPaymentUseCase, via src/app/api/redsys/initiate-mesa/route.ts)
-- derives empresaId server-side from the mesa's own active session lookup —
-- the client only ever supplies mesaId, never empresaId, so a mismatch can't
-- occur through this path today. Fixed anyway for the same reason BAJA-03
-- was applied to the sibling function: a single caller getting it right is
-- not a substitute for the RPC defending itself, and the two functions
-- diverging silently is exactly the kind of inconsistency this project's
-- audits keep finding after the fact.

CREATE OR REPLACE FUNCTION public.claim_and_create_division_pago(
  p_sesion_id            UUID,
  p_empresa_id           UUID,
  p_payment_order_ref    TEXT,
  p_session_total_cents  INTEGER
)
RETURNS TABLE(claimed BOOLEAN, amount_cents INTEGER)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_personas      INTEGER;
  v_active_claims BIGINT;
  v_per_person    INTEGER;
  v_amount        INTEGER;
BEGIN
  SELECT division_personas INTO v_personas
  FROM public.mesa_sesiones
  WHERE id = p_sesion_id
    AND empresa_id = p_empresa_id
    AND cerrada_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;

  IF v_personas IS NULL OR v_personas <= 1 THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;
  SELECT COUNT(*) INTO v_active_claims
  FROM public.mesa_division_pagos
  WHERE sesion_id = p_sesion_id AND status != 'failed';
  IF v_active_claims >= v_personas THEN
    RETURN QUERY SELECT false, 0; RETURN;
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
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_and_create_division_pago(UUID, UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_and_create_division_pago(UUID, UUID, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_and_create_division_pago(UUID, UUID, TEXT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_and_create_division_pago(UUID, UUID, TEXT, INT) TO service_role;
