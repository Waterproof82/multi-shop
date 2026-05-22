-- 1. New table: mesa_sesiones
CREATE TABLE IF NOT EXISTS mesa_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesa_id UUID NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  total NUMERIC(10,2) DEFAULT 0,
  cerrada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add sesion_id to mesas (current active session)
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS sesion_id UUID REFERENCES mesa_sesiones(id);

-- 3. Add sesion_id to pedidos (links order to session)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS sesion_id UUID REFERENCES mesa_sesiones(id);

-- 4. Add waiter_pin_hash to empresas
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS waiter_pin_hash TEXT;

-- 5. Partial unique index: at most one open session per mesa
CREATE UNIQUE INDEX IF NOT EXISTS mesas_one_active_sesion
  ON mesas(id) WHERE sesion_id IS NOT NULL;

-- 6. Performance indexes
CREATE INDEX IF NOT EXISTS idx_mesa_sesiones_mesa_id ON mesa_sesiones(mesa_id);
CREATE INDEX IF NOT EXISTS idx_mesa_sesiones_empresa_id ON mesa_sesiones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_sesion_id ON pedidos(sesion_id);

-- 7. RLS for mesa_sesiones (same pattern as mesas)
ALTER TABLE mesa_sesiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to mesa_sesiones"
  ON mesa_sesiones FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve mesa_sesiones"
  ON mesa_sesiones FOR SELECT
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin crea mesa_sesiones"
  ON mesa_sesiones FOR INSERT
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin edita mesa_sesiones"
  ON mesa_sesiones FOR UPDATE
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin elimina mesa_sesiones"
  ON mesa_sesiones FOR DELETE
  USING (empresa_id = get_mi_empresa_id());

-- 8. RPC: open_mesa_sesion (atomic, idempotent if already open)
CREATE OR REPLACE FUNCTION open_mesa_sesion(p_mesa_id UUID, p_empresa_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sesion_id UUID;
  v_existing UUID;
BEGIN
  -- Check if mesa already has an active session
  SELECT sesion_id INTO v_existing FROM mesas WHERE id = p_mesa_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing; -- idempotent: return existing session
  END IF;

  -- Create new session
  INSERT INTO mesa_sesiones (mesa_id, empresa_id)
  VALUES (p_mesa_id, p_empresa_id)
  RETURNING id INTO v_sesion_id;

  -- Link session to mesa
  UPDATE mesas SET sesion_id = v_sesion_id WHERE id = p_mesa_id;

  RETURN v_sesion_id;
END;
$$;

-- 9. RPC: close_mesa_sesion (atomic close + total calculation)
CREATE OR REPLACE FUNCTION close_mesa_sesion(p_sesion_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total NUMERIC(10,2);
BEGIN
  -- Calculate total from all pedidos in this session
  SELECT COALESCE(SUM(total), 0) INTO v_total
  FROM pedidos
  WHERE sesion_id = p_sesion_id;

  -- Close the session
  UPDATE mesa_sesiones
  SET cerrada_at = now(), total = v_total
  WHERE id = p_sesion_id AND cerrada_at IS NULL;

  -- Clear sesion_id from mesa
  UPDATE mesas SET sesion_id = NULL
  WHERE sesion_id = p_sesion_id;
END;
$$;
