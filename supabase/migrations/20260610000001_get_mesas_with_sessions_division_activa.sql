-- Add division_activa to get_mesas_with_sessions RPC.
-- When a customer selects "Dividir cuenta", division_personas is set and
-- the checkout lock (pago_en_curso) is released so each person can pay
-- their share independently. The waiter grid must still show "pagando"
-- for mesas in division mode, even when no individual share is actively
-- being processed by Redsys at that moment.
DROP FUNCTION IF EXISTS get_mesas_with_sessions(UUID);

CREATE FUNCTION get_mesas_with_sessions(p_empresa_id UUID)
RETURNS TABLE (
  id              UUID,
  empresa_id      UUID,
  numero          INT,
  nombre          TEXT,
  sesion_id       UUID,
  sesion_pagada   BOOLEAN,
  pago_en_curso   BOOLEAN,
  session_total   NUMERIC,
  items_diferidos JSONB,
  cliente_activo  BOOLEAN,
  division_activa BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    m.id,
    m.empresa_id,
    m.numero,
    m.nombre,
    ms.id                                             AS sesion_id,
    COALESCE(ms.sesion_pagada,   false)               AS sesion_pagada,
    COALESCE(ms.pago_en_curso,   false)               AS pago_en_curso,
    COALESCE(ms.pending_total,   0)                   AS session_total,
    COALESCE(ms.items_diferidos, '[]'::jsonb)         AS items_diferidos,
    COALESCE(ms.cliente_activo,  false)               AS cliente_activo,
    (ms.division_personas IS NOT NULL)                AS division_activa
  FROM       mesas        m
  LEFT JOIN  mesa_sesiones ms ON ms.id = m.sesion_id
  WHERE m.empresa_id = p_empresa_id
  ORDER BY m.numero ASC;
$$;

GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO authenticated;
