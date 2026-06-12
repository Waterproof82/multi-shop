-- Fix: session_total should reflect the actual bill (SUM of pedidos.total),
-- not pending_total (which tracks unserved items and is 0 when all items are served).
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
    COALESCE((
      SELECT SUM(p.total)
      FROM pedidos p
      WHERE p.sesion_id = ms.id
    ), 0)                                             AS session_total,
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
