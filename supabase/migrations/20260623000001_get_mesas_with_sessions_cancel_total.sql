-- Update get_mesas_with_sessions to subtract cancelled item prices from session_total.
-- When a waiter cancels an item (pedido_item_estados.estado = 'cancelado'),
-- its price must be excluded from the total shown in the waiter grid.

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
  cliente_activo  BOOLEAN,
  division_activa BOOLEAN,
  llamada_activa  BOOLEAN
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
    -- Gross total minus the sum of all cancelled item prices in the session
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

GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO authenticated;
