CREATE TABLE IF NOT EXISTS public.tpv_turnos (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id                  UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  operador_nombre          TEXT        NOT NULL,
  apertura_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  cierre_at                TIMESTAMPTZ,
  efectivo_apertura_cents  INTEGER     NOT NULL DEFAULT 0,
  efectivo_cierre_cents    INTEGER,
  total_efectivo_cents     INTEGER     NOT NULL DEFAULT 0,
  total_tarjeta_cents      INTEGER     NOT NULL DEFAULT 0,
  diferencia_cents         INTEGER,
  requiere_revision        BOOLEAN     NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tpv_turnos_empresa    ON public.tpv_turnos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_tpv_turnos_activo     ON public.tpv_turnos (empresa_id) WHERE cierre_at IS NULL;

-- RLS
ALTER TABLE public.tpv_turnos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to tpv_turnos"
  ON public.tpv_turnos FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve tpv_turnos"
  ON public.tpv_turnos FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin crea tpv_turnos"
  ON public.tpv_turnos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin edita tpv_turnos"
  ON public.tpv_turnos FOR UPDATE TO authenticated
  USING  (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tpv_turnos TO service_role;
GRANT SELECT, INSERT, UPDATE          ON public.tpv_turnos TO authenticated;
