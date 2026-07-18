-- Fix stale mesas.sesion_id references pointing to closed sessions.
--
-- Root cause: close_mesa_sesion updates mesa_sesiones.cerrada_at but in some
-- edge cases mesas.sesion_id is not cleared (e.g. session closed via direct
-- update rather than the RPC). This leaves mesas.sesion_id pointing to a
-- closed session, causing open_mesa_sesion to early-return with the closed
-- session ID, and findActiveSesionByMesa (which filters cerrada_at IS NULL)
-- to return null — resulting in pedidos created with sesion_id = NULL.

-- 1. Clean up existing inconsistencies
UPDATE public.mesas
SET sesion_id = NULL
WHERE sesion_id IN (
  SELECT id FROM public.mesa_sesiones WHERE cerrada_at IS NOT NULL
);

-- 2. Fix open_mesa_sesion: verify referenced session is actually open
CREATE OR REPLACE FUNCTION public.open_mesa_sesion(p_mesa_id UUID, p_empresa_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion_id UUID;
  v_existing  UUID;
BEGIN
  -- Only return the existing session if it is OPEN (cerrada_at IS NULL)
  SELECT ms.id INTO v_existing
  FROM mesas m
  JOIN mesa_sesiones ms ON ms.id = m.sesion_id AND ms.cerrada_at IS NULL
  WHERE m.id = p_mesa_id;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Clear any stale reference to a closed session before creating a new one
  UPDATE mesas SET sesion_id = NULL
  WHERE id = p_mesa_id AND sesion_id IS NOT NULL;

  -- Create new open session
  INSERT INTO mesa_sesiones (mesa_id, empresa_id)
  VALUES (p_mesa_id, p_empresa_id)
  RETURNING id INTO v_sesion_id;

  -- Link new session to mesa
  UPDATE mesas SET sesion_id = v_sesion_id WHERE id = p_mesa_id;

  RETURN v_sesion_id;
END;
$$;

-- 3. Fix get_mesas_with_sessions: only join OPEN sessions (cerrada_at IS NULL)
--    Previously the LEFT JOIN had no filter, so a stale closed-session reference
--    on mesas.sesion_id made the mesa appear active in the waiter grid.
DROP FUNCTION IF EXISTS get_mesas_with_sessions(UUID);

CREATE FUNCTION public.get_mesas_with_sessions(p_empresa_id UUID)
RETURNS TABLE (
  id              UUID,
  empresa_id      UUID,
  numero          INT,
  nombre          TEXT,
  sesion_id       UUID,
  sesion_pagada   BOOLEAN,
  pago_en_curso   BOOLEAN,
  session_total   NUMERIC,
  cliente_activo  BOOLEAN,
  division_activa BOOLEAN,
  llamada_activa  BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.empresa_id,
    m.numero,
    m.nombre,
    ms.id                                             AS sesion_id,
    COALESCE(ms.sesion_pagada,   false)               AS sesion_pagada,
    COALESCE(ms.pago_en_curso,   false)               AS pago_en_curso,
    COALESCE((
      SELECT SUM(p.total)
      FROM pedidos p
      WHERE p.sesion_id = ms.id
    ), 0)                                             AS session_total,
    COALESCE(ms.cliente_activo,  false)               AS cliente_activo,
    (ms.division_personas IS NOT NULL)                AS division_activa,
    COALESCE(ms.llamada_activa,  false)               AS llamada_activa
  FROM       mesas         m
  LEFT JOIN  mesa_sesiones ms
          ON ms.id = m.sesion_id
         AND ms.cerrada_at IS NULL
  WHERE m.empresa_id = p_empresa_id
  ORDER BY m.numero ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_mesas_with_sessions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_mesas_with_sessions(UUID) TO authenticated;
