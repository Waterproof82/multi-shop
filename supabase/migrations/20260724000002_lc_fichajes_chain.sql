-- ================================================================
-- LaborControl: lc_fichajes — monthly-partitioned chain table
--
-- Depends on:
--   20260724000001_lc_base.sql  (empleados_tpv, empresas FK targets,
--                                 lc_rlt_asignaciones, get_mi_empresa_id)
--
-- pgcrypto already enabled in 20260703000001_tpv_cobros.sql
-- (digest() is available — no need to CREATE EXTENSION again)
-- ================================================================


-- ================================================================
-- 0. Global monotonic sequence for chain ordering
--    Orders by chain_seq DESC — never by timestamps (FIX-01)
-- ================================================================
CREATE SEQUENCE public.lc_fichajes_chain_seq AS BIGINT;


-- ================================================================
-- 1. Main table — PARTITIONED BY RANGE (timestamp_servidor)
-- ================================================================
CREATE TABLE public.lc_fichajes (
  record_id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  chain_seq          BIGINT      NOT NULL DEFAULT nextval('public.lc_fichajes_chain_seq'),
  empresa_id         UUID        NOT NULL REFERENCES public.empresas(id)   ON DELETE RESTRICT,
  centro_id          UUID        NOT NULL REFERENCES public.empresas(id)    ON DELETE RESTRICT,
  empleado_id        UUID        NOT NULL REFERENCES public.empleados_tpv(id)  ON DELETE RESTRICT,
  -- actor_id is the authenticated user (admin, encargado, or RLT) who submitted the record.
  -- Not a FK: the actor may be a service-role identity with no row in auth.users.
  actor_id           UUID        NOT NULL,
  tipo               TEXT        NOT NULL CHECK (tipo IN ('entrada','salida','inicio_pausa','fin_pausa','correccion')),
  accion             TEXT                 CHECK (accion IN ('rectificar','anular')),
  -- ref_correccion has NO FK: partitioned tables cannot carry a FK that omits the partition
  -- key (timestamp_servidor). Self-referencing across partitions is unsupported by PostgreSQL.
  -- Application layer is responsible for validating that the referenced record_id exists.
  ref_correccion     UUID,
  timestamp_evento   TIMESTAMPTZ NOT NULL,
  -- clock_timestamp() captures the real wall-clock instant, not the frozen transaction start
  -- that now() returns. Critical for chain ordering correctness (FIX-01).
  timestamp_servidor TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  origen_offline     BOOLEAN     NOT NULL DEFAULT false,
  motivo             TEXT,
  chain_hash         TEXT        NOT NULL,
  prev_hash          TEXT        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
) PARTITION BY RANGE (timestamp_servidor);

-- ── Indexes ──────────────────────────────────────────────────────
-- Tail lookup for chain (BEFORE INSERT trigger uses this)
CREATE INDEX idx_lc_fichajes_empresa_seq ON public.lc_fichajes (empresa_id, chain_seq DESC);
-- Employee history queries
CREATE INDEX idx_lc_fichajes_empleado_ts ON public.lc_fichajes (empleado_id, timestamp_servidor DESC);
-- Supervisor dashboard: centro + current day
CREATE INDEX idx_lc_fichajes_centro_ts   ON public.lc_fichajes (centro_id, timestamp_servidor DESC);


-- ================================================================
-- 2. Monthly partitions — current month + next month
--    Created dynamically so this migration stays valid year-round.
-- ================================================================

-- Current month
DO $$
DECLARE
  v_start DATE := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_end   DATE := v_start + INTERVAL '1 month';
  v_name  TEXT := 'lc_fichajes_' || to_char(v_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.lc_fichajes FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end
  );
END $$;

-- Next month
DO $$
DECLARE
  v_start DATE := (date_trunc('month', now() AT TIME ZONE 'UTC') + INTERVAL '1 month')::date;
  v_end   DATE := v_start + INTERVAL '1 month';
  v_name  TEXT := 'lc_fichajes_' || to_char(v_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.lc_fichajes FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end
  );
END $$;


-- ================================================================
-- 3. Canonical payload function (IMMUTABLE — callable for testing)
--
-- Format: v1|key=value|... in ALPHABETICAL KEY ORDER (FIX-02)
-- NULL sentinel: \N (literal backslash-N)
-- Booleans: 'true' / 'false'
-- Timestamps: UTC with 6-digit microseconds
-- motivo: hashed as SHA-256 hex; \N if null
-- actor_id IS included in the payload (FIX-04)
-- ================================================================
CREATE OR REPLACE FUNCTION public.lc_canonical_payload(
  p_record_id        UUID,
  p_empresa_id       UUID,
  p_centro_id        UUID,
  p_empleado_id      UUID,
  p_actor_id         UUID,
  p_tipo             TEXT,
  p_accion           TEXT,
  p_ref_correccion   UUID,
  p_timestamp_evento TIMESTAMPTZ,
  p_timestamp_servidor TIMESTAMPTZ,
  p_origen_offline   BOOLEAN,
  p_motivo           TEXT,
  p_prev_hash        TEXT
) RETURNS TEXT AS $func$
DECLARE
  v_null CONSTANT TEXT := '\N';
BEGIN
  RETURN 'v1'
    || '|accion='                 || COALESCE(p_accion, v_null)
    || '|actor_id='               || COALESCE(p_actor_id::text, v_null)
    || '|centro_id='              || p_centro_id::text
    || '|empleado_id='            || p_empleado_id::text
    || '|empresa_id='             || p_empresa_id::text
    || '|motivo_sha256='          || COALESCE(
                                        encode(digest(convert_to(p_motivo, 'UTF8'), 'sha256'), 'hex'),
                                        v_null
                                      )
    || '|origen_offline='         || CASE WHEN p_origen_offline THEN 'true' ELSE 'false' END
    || '|prev_hash='              || p_prev_hash
    || '|record_id='              || p_record_id::text
    || '|ref_correccion='         || COALESCE(p_ref_correccion::text, v_null)
    || '|timestamp_evento_utc='   || to_char(p_timestamp_evento   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    || '|timestamp_servidor_utc=' || to_char(p_timestamp_servidor AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    || '|tipo='                   || p_tipo;
END;
$func$ LANGUAGE plpgsql IMMUTABLE;


-- ================================================================
-- 4. BEFORE INSERT trigger — computes prev_hash + chain_hash
--
-- Uses advisory lock on hashed empresa_id to serialize concurrent
-- inserts within the same empresa (prevents chain forks under load).
-- Tail lookup uses chain_seq DESC — never timestamps (FIX-01).
-- Falls back to lc_chain_anchors (created in migration 3) or
-- 'SEGMENT_GENESIS' for the first record in a segment.
-- ================================================================
CREATE OR REPLACE FUNCTION public.lc_fichajes_chain_before()
RETURNS TRIGGER AS $func$
DECLARE
  v_prev_hash TEXT;
  v_payload   TEXT;
BEGIN
  -- Serialize chain writes per empresa (advisory lock on hashed empresa_id)
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(NEW.empresa_id::text), 1, 16))::bit(64)::bigint
  );

  -- Find prev_hash using chain_seq (monotonic) — not timestamp
  SELECT chain_hash INTO v_prev_hash
    FROM public.lc_fichajes
   WHERE empresa_id = NEW.empresa_id
   ORDER BY chain_seq DESC
   LIMIT 1;

  -- No records in chain yet: look for last sealed anchor, then fall back to genesis
  IF v_prev_hash IS NULL THEN
    SELECT final_hash INTO v_prev_hash
      FROM public.lc_chain_anchors
     WHERE empresa_id = NEW.empresa_id
     ORDER BY segment_year DESC, segment_month DESC
     LIMIT 1;
    v_prev_hash := COALESCE(v_prev_hash, 'SEGMENT_GENESIS');
  END IF;

  NEW.prev_hash := v_prev_hash;

  -- Compute canonical payload and SHA-256 hash
  v_payload := public.lc_canonical_payload(
    NEW.record_id,
    NEW.empresa_id,
    NEW.centro_id,
    NEW.empleado_id,
    NEW.actor_id,
    NEW.tipo,
    NEW.accion,
    NEW.ref_correccion,
    NEW.timestamp_evento,
    NEW.timestamp_servidor,
    NEW.origen_offline,
    NEW.motivo,
    v_prev_hash
  );

  NEW.chain_hash := encode(digest(v_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER lc_fichajes_chain_before
  BEFORE INSERT ON public.lc_fichajes
  FOR EACH ROW EXECUTE FUNCTION public.lc_fichajes_chain_before();


-- ================================================================
-- 5. AFTER INSERT trigger — verify no fork occurred
--
-- Reads the record that was just committed and checks that
-- prev_hash matches the predecessor's chain_hash.
-- Raises EXCEPTION on mismatch — rolling back the insert.
-- ================================================================
CREATE OR REPLACE FUNCTION public.lc_fichajes_chain_verify_after()
RETURNS TRIGGER AS $func$
DECLARE
  v_expected TEXT;
BEGIN
  SELECT chain_hash INTO v_expected
    FROM public.lc_fichajes
   WHERE empresa_id = NEW.empresa_id
     AND chain_seq < NEW.chain_seq
   ORDER BY chain_seq DESC
   LIMIT 1;

  IF v_expected IS NULL THEN
    -- First record in segment: prev_hash must match last anchor or genesis sentinel
    IF NEW.prev_hash NOT IN (
         COALESCE(
           (SELECT final_hash
              FROM public.lc_chain_anchors
             WHERE empresa_id = NEW.empresa_id
             ORDER BY segment_year DESC, segment_month DESC
             LIMIT 1),
           'SEGMENT_GENESIS'
         ),
         'SEGMENT_GENESIS'
       )
    THEN
      RAISE EXCEPTION
        'lc_fichajes: chain fork detected (genesis mismatch) empresa=%',
        NEW.empresa_id;
    END IF;
  ELSIF NEW.prev_hash <> v_expected THEN
    RAISE EXCEPTION
      'lc_fichajes: chain fork detected at chain_seq=% empresa=%',
      NEW.chain_seq, NEW.empresa_id;
  END IF;

  RETURN NULL;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER lc_fichajes_chain_verify
  AFTER INSERT ON public.lc_fichajes
  FOR EACH ROW EXECUTE FUNCTION public.lc_fichajes_chain_verify_after();


-- ================================================================
-- 6. Immutability guard — BEFORE UPDATE OR DELETE
--
-- lc_fichajes records are write-once by design.
-- Corrections are modeled as new chain entries (tipo='correccion'),
-- never as mutations of existing rows.
-- ================================================================
CREATE OR REPLACE FUNCTION public.lc_immutable_guard()
RETURNS TRIGGER AS $func$
BEGIN
  RAISE EXCEPTION
    'lc_fichajes: records are immutable — UPDATE and DELETE are prohibited (tabla: %)',
    TG_TABLE_NAME;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER lc_fichajes_immutable
  BEFORE UPDATE OR DELETE ON public.lc_fichajes
  FOR EACH ROW EXECUTE FUNCTION public.lc_immutable_guard();


-- ================================================================
-- 7. RLS
-- ================================================================
ALTER TABLE public.lc_fichajes ENABLE ROW LEVEL SECURITY;

-- Anon: block all access
CREATE POLICY "No direct anon access to lc_fichajes"
  ON public.lc_fichajes FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Admin / encargado: full empresa read
CREATE POLICY "Admin ve fichajes de su empresa"
  ON public.lc_fichajes FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin pa
       WHERE pa.id         = auth.uid()
         AND pa.empresa_id = lc_fichajes.empresa_id
    )
  );

-- RLT (Representante Legal de Trabajadores): read fichajes of their assigned centro
-- lc_rlt_asignaciones is created in migration 20260724000001_lc_base.sql
CREATE POLICY "RLT ve fichajes de su centro"
  ON public.lc_fichajes FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id    = auth.uid()
         AND r.empresa_id = lc_fichajes.empresa_id
         AND r.centro_id  = lc_fichajes.centro_id
         AND r.activo
    )
  );

-- No INSERT policy for authenticated role.
-- All inserts go through API routes that use the service_role key.


-- ================================================================
-- 8. GRANTs + REVOKE immutability at DB level (FIX-05)
--
-- REVOKE UPDATE/DELETE from authenticated so even a policy mistake
-- cannot allow row mutation. The immutability trigger is the second
-- layer of defense.
-- ================================================================
REVOKE UPDATE, DELETE ON public.lc_fichajes FROM authenticated;

GRANT SELECT, INSERT ON public.lc_fichajes TO service_role;
GRANT SELECT         ON public.lc_fichajes TO authenticated;

-- Restrict canonical payload function to service_role only
-- (prevents clients from probing the hash algorithm directly)
REVOKE EXECUTE ON FUNCTION public.lc_canonical_payload(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, UUID,
  TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lc_canonical_payload(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, UUID,
  TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) TO service_role;


-- ================================================================
-- 9. Realtime publication
--
-- publish_via_partition_root allows the supervisor dashboard to
-- subscribe to the parent table without knowing partition names.
-- Falls back gracefully with a WARNING if the plan does not support it
-- (supervisor dashboard will use 10-second polling as fallback).
-- ================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lc_fichajes;
  -- publish_via_partition_root may require Supabase Pro or specific config
  EXECUTE 'ALTER PUBLICATION supabase_realtime SET (publish_via_partition_root = true)';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING
    'publish_via_partition_root not supported on this plan: %. Supervisor dashboard will use 10s polling fallback.',
    SQLERRM;
END $$;
