-- ============================================================
-- LaborControl — Auxiliary Tables (Migration 3/3)
-- Depends on:
--   20260724000001_lc_fichajes.sql        (lc_fichajes, lc_immutable_guard)
--   20260724000002_lc_perfil_laboral.sql  (lc_perfil_laboral, lc_rlt_asignaciones)
-- ============================================================

-- ─── 1. lc_chain_anchors ──────────────────────────────────────────────────────
-- Monthly chain segment seals. Immutable once written (ADR-10).

CREATE TABLE public.lc_chain_anchors (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID        NOT NULL REFERENCES public.empresas(id)  ON DELETE RESTRICT,
  segment_year   INT         NOT NULL,
  segment_month  INT         NOT NULL CHECK (segment_month BETWEEN 1 AND 12),
  final_hash     TEXT        NOT NULL,
  record_count   BIGINT      NOT NULL DEFAULT 0,
  sealed_at      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sealed_by      UUID        NOT NULL,  -- system actor or admin user
  UNIQUE (empresa_id, segment_year, segment_month)
);

ALTER TABLE public.lc_chain_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_chain_anchors"
  ON public.lc_chain_anchors FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve lc_chain_anchors"
  ON public.lc_chain_anchors FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- Immutability: revoke UPDATE/DELETE from authenticated layer;
-- service_role bypasses RLS but the trigger below blocks everyone.
REVOKE UPDATE, DELETE ON public.lc_chain_anchors FROM authenticated;

CREATE TRIGGER lc_chain_anchors_immutable
  BEFORE UPDATE OR DELETE ON public.lc_chain_anchors
  FOR EACH ROW EXECUTE FUNCTION lc_immutable_guard();

-- GRANTs: service_role INSERT+SELECT only (no UPDATE/DELETE at DB level either)
GRANT SELECT, INSERT ON public.lc_chain_anchors TO service_role;
GRANT SELECT          ON public.lc_chain_anchors TO authenticated;

-- ─── 2. lc_legal_holds ────────────────────────────────────────────────────────
-- Legal hold registry. NULL empleado_id = hold on entire empresa.

CREATE TABLE public.lc_legal_holds (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES public.empresas(id)   ON DELETE RESTRICT,
  empleado_id  UUID                 REFERENCES public.empleados_tpv(id)  ON DELETE RESTRICT,
  fecha_inicio DATE        NOT NULL,
  fecha_fin    DATE        NOT NULL CHECK (fecha_fin >= fecha_inicio),
  motivo       TEXT        NOT NULL,
  actor_id     UUID        NOT NULL,
  activo       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at    TIMESTAMPTZ          -- set when hold is lifted; NULL while active
);

CREATE INDEX idx_lc_legal_holds_empresa ON public.lc_legal_holds (empresa_id, activo);

ALTER TABLE public.lc_legal_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_legal_holds"
  ON public.lc_legal_holds FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve lc_legal_holds"
  ON public.lc_legal_holds FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin crea lc_legal_holds"
  ON public.lc_legal_holds FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin actualiza lc_legal_holds"
  ON public.lc_legal_holds FOR UPDATE TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lc_legal_holds TO service_role;
GRANT SELECT                          ON public.lc_legal_holds TO authenticated;

-- ─── 3. lc_fichajes_hold_archive ──────────────────────────────────────────────
-- ADR-11: This table is INTENTIONALLY deletable by the purge job.
-- Authenticity of archived rows is proven via their copied chain_hash values,
-- which are verifiable against lc_chain_anchors. No immutability trigger is
-- applied here — the invariant is the hash chain, not row presence.

CREATE TABLE public.lc_fichajes_hold_archive (
  -- Verbatim columns copied from lc_fichajes on archive
  record_id              UUID        NOT NULL,
  chain_seq              BIGINT      NOT NULL,
  empresa_id             UUID        NOT NULL,
  centro_id              UUID        NOT NULL,
  empleado_id            UUID        NOT NULL,
  actor_id               UUID        NOT NULL,
  tipo                   TEXT        NOT NULL,
  accion                 TEXT,
  ref_correccion         UUID,
  timestamp_evento       TIMESTAMPTZ NOT NULL,
  timestamp_servidor     TIMESTAMPTZ NOT NULL,
  origen_offline         BOOLEAN     NOT NULL DEFAULT false,
  motivo                 TEXT,
  chain_hash             TEXT        NOT NULL,
  prev_hash              TEXT        NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL,
  -- Archive metadata
  hold_id                UUID        NOT NULL REFERENCES public.lc_legal_holds(id) ON DELETE RESTRICT,
  archived_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive_purge_at       TIMESTAMPTZ,  -- max(timestamp_evento + 4 years, hold.lifted_at); NULL while hold active
  PRIMARY KEY (empresa_id, record_id, chain_seq)
);

CREATE INDEX idx_lc_hold_archive_hold    ON public.lc_fichajes_hold_archive (hold_id);
CREATE INDEX idx_lc_hold_archive_empresa ON public.lc_fichajes_hold_archive (empresa_id, archive_purge_at);

ALTER TABLE public.lc_fichajes_hold_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_fichajes_hold_archive"
  ON public.lc_fichajes_hold_archive FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve lc_fichajes_hold_archive"
  ON public.lc_fichajes_hold_archive FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- GRANTs: service_role retains DELETE for the purge job (ADR-11)
GRANT SELECT, INSERT, DELETE ON public.lc_fichajes_hold_archive TO service_role;
GRANT SELECT                  ON public.lc_fichajes_hold_archive TO authenticated;

-- ─── 4. lc_audit_log ──────────────────────────────────────────────────────────
-- Immutable audit trail. INSERT-only by design.

CREATE TABLE public.lc_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        NOT NULL,
  actor_id      UUID        NOT NULL,
  action_type   TEXT        NOT NULL,  -- e.g. 'fichaje.entrada', 'correccion.rectificar', 'chain.anchor', 'hold.create', 'partition.drop'
  entity_type   TEXT,
  entity_id     UUID,
  reason        TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  timestamp_srv TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_lc_audit_empresa_ts ON public.lc_audit_log (empresa_id, timestamp_srv DESC);
CREATE INDEX idx_lc_audit_actor      ON public.lc_audit_log (actor_id, timestamp_srv DESC);
CREATE INDEX idx_lc_audit_entity     ON public.lc_audit_log (entity_id) WHERE entity_id IS NOT NULL;

ALTER TABLE public.lc_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_audit_log"
  ON public.lc_audit_log FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve lc_audit_log"
  ON public.lc_audit_log FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

REVOKE UPDATE, DELETE ON public.lc_audit_log FROM authenticated;

CREATE TRIGGER lc_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.lc_audit_log
  FOR EACH ROW EXECUTE FUNCTION lc_immutable_guard();

-- GRANTs: no UPDATE/DELETE at all — INSERT+SELECT for service_role
GRANT SELECT, INSERT ON public.lc_audit_log TO service_role;
GRANT SELECT          ON public.lc_audit_log TO authenticated;

-- ─── 5. lc_review_queue ───────────────────────────────────────────────────────
-- Mutable workflow state for orphans, drift, failed syncs, ack requests, disputes.
-- Employees access their own rows via API route (tpv_employee_token), not direct RLS.

CREATE TABLE public.lc_review_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  centro_id     UUID        NOT NULL,
  empleado_id   UUID        NOT NULL,
  record_id     UUID,                 -- fichaje concerned; NULL for sync_failed with no server record
  tipo_revision TEXT        NOT NULL CHECK (tipo_revision IN ('orphan','drift','sync_failed','ack_pendiente','disputa')),
  estado        TEXT        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','visto','disputado','resuelto')),
  detalle       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID
);

CREATE INDEX idx_lc_review_pendientes ON public.lc_review_queue (empresa_id, estado)
  WHERE estado IN ('pendiente','disputado');
CREATE INDEX idx_lc_review_empleado   ON public.lc_review_queue (empleado_id, created_at DESC);
CREATE INDEX idx_lc_review_record     ON public.lc_review_queue (record_id) WHERE record_id IS NOT NULL;

ALTER TABLE public.lc_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_review_queue"
  ON public.lc_review_queue FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve lc_review_queue"
  ON public.lc_review_queue FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- GRANTs: service_role full mutable access; authenticated SELECT only
GRANT SELECT, INSERT, UPDATE ON public.lc_review_queue TO service_role;
GRANT SELECT                  ON public.lc_review_queue TO authenticated;

-- ─── 6. lc_horas_extra ────────────────────────────────────────────────────────
-- Overtime records per employee per day.

CREATE TABLE public.lc_horas_extra (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID         NOT NULL REFERENCES public.empresas(id)   ON DELETE RESTRICT,
  empleado_id    UUID         NOT NULL REFERENCES public.empleados_tpv(id)  ON DELETE RESTRICT,
  centro_id      UUID         NOT NULL REFERENCES public.empresas(id)    ON DELETE RESTRICT,
  fecha          DATE         NOT NULL,
  horas_extra    NUMERIC(5,2) NOT NULL CHECK (horas_extra > 0),
  compensacion   TEXT         NOT NULL CHECK (compensacion IN ('salario','descanso')),
  notas          TEXT,
  registrado_por UUID         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_lc_horas_extra_empleado ON public.lc_horas_extra (empleado_id, fecha DESC);
CREATE INDEX idx_lc_horas_extra_empresa  ON public.lc_horas_extra (empresa_id, fecha DESC);

ALTER TABLE public.lc_horas_extra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_horas_extra"
  ON public.lc_horas_extra FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve lc_horas_extra"
  ON public.lc_horas_extra FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin crea horas_extra"
  ON public.lc_horas_extra FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin actualiza horas_extra"
  ON public.lc_horas_extra FOR UPDATE TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- RLT: representante legal de trabajadores ve horas_extra de su centro asignado
CREATE POLICY "RLT ve horas_extra de su centro"
  ON public.lc_horas_extra FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id    = auth.uid()
         AND r.empresa_id = lc_horas_extra.empresa_id
         AND r.centro_id  = lc_horas_extra.centro_id
         AND r.activo
    )
  );

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lc_horas_extra TO service_role;
GRANT SELECT                          ON public.lc_horas_extra TO authenticated;
