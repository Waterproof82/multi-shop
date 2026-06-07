-- Atomic payment lock acquisition for mesa sessions.
--
-- Replaces the read-then-write pattern in the API route with a single
-- Postgres UPDATE that is serializable by definition. Only one concurrent
-- caller can win: the one whose UPDATE matches the WHERE condition first.
--
-- Returns TRUE  → lock acquired (caller owns it)
-- Returns FALSE → another fresh lock is already held (caller gets 423)
--
-- The expiry window (15 min) matches LOCK_EXPIRY_MS in the API route.

CREATE OR REPLACE FUNCTION public.acquire_mesa_lock(p_mesa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
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

-- service_role: used by the API route (backend)
GRANT EXECUTE ON FUNCTION public.acquire_mesa_lock(uuid) TO service_role;
-- authenticated: defence in depth if ever called from a client context
GRANT EXECUTE ON FUNCTION public.acquire_mesa_lock(uuid) TO authenticated;
