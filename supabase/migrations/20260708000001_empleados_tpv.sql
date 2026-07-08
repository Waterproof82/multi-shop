-- ================================================================
-- 1. NEW TABLE: empleados_tpv
-- ================================================================
CREATE TABLE IF NOT EXISTS public.empleados_tpv (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  rol         TEXT        NOT NULL CHECK (rol IN ('cajero', 'encargado')),
  pin_hash    TEXT        NOT NULL,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique PIN per empresa (active employees only)
CREATE UNIQUE INDEX IF NOT EXISTS uq_empleados_tpv_pin_empresa
  ON public.empleados_tpv (empresa_id, pin_hash)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_empleados_tpv_empresa ON public.empleados_tpv (empresa_id);

-- RLS
ALTER TABLE public.empleados_tpv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to empleados_tpv"
  ON public.empleados_tpv FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve empleados_tpv"
  ON public.empleados_tpv FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin gestiona empleados_tpv"
  ON public.empleados_tpv FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin edita empleados_tpv"
  ON public.empleados_tpv FOR UPDATE TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin borra empleados_tpv"
  ON public.empleados_tpv FOR DELETE TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleados_tpv TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleados_tpv TO authenticated;

-- ================================================================
-- 2. ALTER tpv_turnos: add operador_id + make user_id nullable
-- ================================================================
ALTER TABLE public.tpv_turnos
  ADD COLUMN operador_id UUID REFERENCES public.empleados_tpv(id) ON DELETE SET NULL;

-- user_id must be nullable for employee-opened turnos (no auth.users UUID)
ALTER TABLE public.tpv_turnos ALTER COLUMN user_id DROP NOT NULL;
