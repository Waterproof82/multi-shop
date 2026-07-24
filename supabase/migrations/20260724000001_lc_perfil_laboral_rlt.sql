-- =============================================================================
-- LaborControl — Migration 1 of 4
-- Tables: lc_perfil_laboral, lc_rlt_asignaciones
--
-- lc_perfil_laboral  — Labor profile extension of the empleados table.
--                      One record per employee per empresa, holds contract
--                      type, theoretical hours, work schedule, and timezone.
--                      Soft-offboarding via activo = false (no DELETE policy).
--
-- lc_rlt_asignaciones — Workers' representative (RLT) role assignments.
--                       Links a Supabase Auth user to an empresa + centro.
--                       Managed exclusively via API route with requireRole.
--
-- DEPENDENCY NOTE:
--   FKs reference public.empleados_tpv and public.empresas (used as centro de trabajo for v1).
--   in migrations as of 2026-07-24 — only public.empleados_tpv is present.
--   These tables must be created in a prior or sibling migration within the
--   LaborControl bounded context before applying this file.
--   If the intent was public.empleados_tpv, update the FK targets accordingly.
-- =============================================================================

-- ============================================================
-- 1. lc_perfil_laboral
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lc_perfil_laboral (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID         NOT NULL REFERENCES public.empresas(id)   ON DELETE RESTRICT,
  empleado_id           UUID         NOT NULL REFERENCES public.empleados_tpv(id)  ON DELETE RESTRICT,
  centro_id             UUID         NOT NULL REFERENCES public.empresas(id)    ON DELETE RESTRICT,
  jornada_teorica_horas NUMERIC(5,2) NOT NULL DEFAULT 40,
  tipo_contrato         TEXT         NOT NULL DEFAULT 'indefinido'
                          CHECK (tipo_contrato IN (
                            'indefinido', 'temporal', 'obra_servicio',
                            'practicas', 'formacion', 'otro'
                          )),
  tiempo_parcial        BOOLEAN      NOT NULL DEFAULT false,
  convenio              TEXT,
  timezone              TEXT         NOT NULL DEFAULT 'Europe/Madrid',
  activo                BOOLEAN      NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, empleado_id)
);

CREATE INDEX IF NOT EXISTS idx_lc_perfil_laboral_empresa_id
  ON public.lc_perfil_laboral (empresa_id);

CREATE INDEX IF NOT EXISTS idx_lc_perfil_laboral_empleado_id
  ON public.lc_perfil_laboral (empleado_id);

-- RLS
ALTER TABLE public.lc_perfil_laboral ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_perfil_laboral"
  ON public.lc_perfil_laboral FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve lc_perfil_laboral"
  ON public.lc_perfil_laboral FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin gestiona lc_perfil_laboral"
  ON public.lc_perfil_laboral FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin edita lc_perfil_laboral"
  ON public.lc_perfil_laboral FOR UPDATE TO authenticated
  USING  (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- No DELETE policy — use activo = false for soft-offboarding.

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lc_perfil_laboral TO service_role;
GRANT SELECT, INSERT, UPDATE           ON public.lc_perfil_laboral TO authenticated;

-- ============================================================
-- 2. lc_rlt_asignaciones
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lc_rlt_asignaciones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  user_id    UUID        NOT NULL, -- Supabase Auth user; RLT members authenticate via browser
  centro_id  UUID        NOT NULL REFERENCES public.empresas(id)  ON DELETE RESTRICT,
  activo     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID        NOT NULL,
  UNIQUE (empresa_id, user_id, centro_id)
);

CREATE INDEX IF NOT EXISTS idx_lc_rlt_empresa_id
  ON public.lc_rlt_asignaciones (empresa_id);

CREATE INDEX IF NOT EXISTS idx_lc_rlt_user
  ON public.lc_rlt_asignaciones (user_id)
  WHERE activo;

-- RLS
ALTER TABLE public.lc_rlt_asignaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_rlt_asignaciones"
  ON public.lc_rlt_asignaciones FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve lc_rlt_asignaciones"
  ON public.lc_rlt_asignaciones FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- No INSERT/UPDATE policies — managed exclusively via API route
-- with requireRole(['admin', 'superadmin']) using service_role client.

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lc_rlt_asignaciones TO service_role;
GRANT SELECT                          ON public.lc_rlt_asignaciones TO authenticated;
