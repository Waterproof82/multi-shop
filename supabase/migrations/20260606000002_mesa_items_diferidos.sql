-- Add items_diferidos column to mesa_sesiones
ALTER TABLE public.mesa_sesiones
  ADD COLUMN IF NOT EXISTS items_diferidos JSONB NOT NULL DEFAULT '[]';

-- Update get_mesas_with_sessions RPC to include items_diferidos.
-- This replaces the existing RPC (which was applied directly to the DB).
-- The function returns one row per mesa, LEFT JOINed to its active session.
CREATE OR REPLACE FUNCTION get_mesas_with_sessions(p_empresa_id UUID)
RETURNS TABLE (
  id             UUID,
  empresa_id     UUID,
  numero         INT,
  nombre         TEXT,
  sesion_id      UUID,
  sesion_pagada  BOOLEAN,
  pago_en_curso  BOOLEAN,
  session_total  NUMERIC,
  items_diferidos JSONB
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    m.id,
    m.empresa_id,
    m.numero,
    m.nombre,
    ms.id                                         AS sesion_id,
    COALESCE(ms.sesion_pagada,   false)           AS sesion_pagada,
    COALESCE(ms.pago_en_curso,   false)           AS pago_en_curso,
    COALESCE(ms.pending_total,   0)               AS session_total,
    COALESCE(ms.items_diferidos, '[]'::jsonb)     AS items_diferidos
  FROM       mesas        m
  LEFT JOIN  mesa_sesiones ms ON ms.id = m.sesion_id
  WHERE m.empresa_id = p_empresa_id
  ORDER BY m.numero ASC;
$$;

GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO authenticated;
