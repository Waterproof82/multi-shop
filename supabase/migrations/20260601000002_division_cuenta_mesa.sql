-- Add split-bill tracking columns to mesa_sesiones
ALTER TABLE public.mesa_sesiones
  ADD COLUMN IF NOT EXISTS division_personas INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS division_pagos_realizados INT NOT NULL DEFAULT 0;

-- Atomic increment for division_pagos_realizados
-- Returns the updated counts so the caller can decide if all shares are paid
CREATE OR REPLACE FUNCTION increment_division_pagos(p_sesion_id UUID)
RETURNS TABLE(pagos_realizados INT, personas INT)
LANGUAGE plpgsql
SECURITY DEFINER
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
