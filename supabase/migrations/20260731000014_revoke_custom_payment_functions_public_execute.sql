-- BAJA-01 follow-up: cancel_custom_turn, commit_custom_payment,
-- complete_custom_payment, switch_to_equal_split_remaining,
-- update_custom_selection and get_next_pedido_number are SECURITY INVOKER
-- functions with simple UUID/int/jsonb parameters, exposed via
-- /rest/v1/rpc/* to anon and authenticated. Same class of issue as
-- acquire_mesa_lock/claim_and_create_division_pago/claim_custom_turn
-- (already fixed in 20260730000004) — the BAJA-01 hardening pass covered
-- those 3 but missed these 6 siblings in the same custom-turn/split-bill
-- payment family. Verified: RLS (RESTRICTIVE deny-all on
-- mesa_pagos_personalizados/mesa_item_pagos/mesa_sesiones/pedidos) already
-- blocks any actual data access or mutation when called as anon — confirmed
-- live via curl (cancel_custom_turn with a fake UUID returns
-- TURNO_NOT_FOUND, get_next_pedido_number returns 401 permission denied).
-- But relying on RLS alone as the only line of defense for a directly
-- callable payment-mutating RPC is exactly the "unnecessary exposure"
-- BAJA-01 already flagged as worth closing regardless. All 6 are called
-- exclusively from server-side use-cases via service_role
-- (src/core/application/use-cases/payment/*, supabase-pedido.repository.ts).

REVOKE EXECUTE ON FUNCTION public.cancel_custom_turn(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_custom_turn(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_custom_turn(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.cancel_custom_turn(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.commit_custom_payment(UUID, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.commit_custom_payment(UUID, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.commit_custom_payment(UUID, TEXT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.commit_custom_payment(UUID, TEXT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_custom_payment(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_custom_payment(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_custom_payment(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.complete_custom_payment(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.switch_to_equal_split_remaining(UUID, UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.switch_to_equal_split_remaining(UUID, UUID, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.switch_to_equal_split_remaining(UUID, UUID, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.switch_to_equal_split_remaining(UUID, UUID, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_custom_selection(UUID, JSONB, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_custom_selection(UUID, JSONB, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_custom_selection(UUID, JSONB, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.update_custom_selection(UUID, JSONB, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_next_pedido_number(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_next_pedido_number(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_next_pedido_number(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_next_pedido_number(UUID) TO service_role;

-- Broaden the audit function: previously only scanned SECURITY DEFINER
-- functions (r.security_type = 'DEFINER'), missing this entire class of
-- SECURITY INVOKER RPC exposure. Trigger functions (data_type = 'trigger')
-- are excluded — Postgres itself refuses to invoke them outside a trigger
-- context regardless of grants, so they are not exploitable via RPC and
-- would otherwise dominate the result set with noise.
CREATE OR REPLACE FUNCTION public.check_public_function_grants()
RETURNS TABLE(routine_name TEXT, grantee TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
  SELECT
    r.routine_name::TEXT,
    g.grantee::TEXT
  FROM information_schema.routines r
  JOIN information_schema.role_routine_grants g
    ON g.routine_name    = r.routine_name
   AND g.routine_schema  = r.routine_schema
   AND g.specific_schema = r.specific_schema
  WHERE r.routine_schema = 'public'
    AND r.data_type      != 'trigger'
    AND g.grantee        IN ('anon', 'authenticated', 'PUBLIC')
  ORDER BY r.routine_name, g.grantee;
$$;

REVOKE EXECUTE ON FUNCTION public.check_public_function_grants() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_public_function_grants() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_public_function_grants() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_public_function_grants() TO service_role;

-- Drop the old, narrower function now that check_public_function_grants
-- supersedes it (same query, broader coverage).
DROP FUNCTION IF EXISTS public.check_security_definer_grants();
