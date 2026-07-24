-- ============================================================================
-- LaborControl — SECURITY DEFINER functions and cron documentation
-- Migration: 20260724000004_lc_functions_crons.sql
--
-- Creates:
--   1. lc_seal_month_anchors(p_year, p_month)  — seals a month's chain segment
--   2. lc_create_next_partition()              — creates next month's partition (idempotent)
--   3. lc_drop_expired_partition(p_name)       — drops a partition after 4-year retention
--   4. lc_verify_chain_segment(empresa, year, month) — verifies chain integrity
--
-- All functions use SECURITY DEFINER + REVOKE-from-PUBLIC pattern.
-- Cron schedule is documented here; execution lives in Vercel (pg_cron unavailable on Free plan).
-- ============================================================================

-- System actor UUID: used by all automated jobs (sealing, purge, partition create)
-- so audit entries clearly distinguish human vs. automated actions
COMMENT ON SCHEMA public IS 'LC_SYSTEM_ACTOR = ''00000000-0000-0000-0000-000000000000''';

-- ============================================================================
-- FUNCTION 1: lc_seal_month_anchors
-- Seals the final chain hash and record count for every empresa in a given
-- year/month segment. Inserts into lc_chain_anchors; skips if already sealed
-- (ON CONFLICT DO NOTHING — idempotent).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lc_seal_month_anchors(p_year INT, p_month INT)
RETURNS TABLE (empresa_id UUID, final_hash TEXT, record_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $func$
BEGIN
  RETURN QUERY
  WITH segment_range AS (
    SELECT
      make_timestamptz(p_year, p_month, 1, 0,0,0, 'UTC')                        AS seg_start,
      make_timestamptz(p_year, p_month, 1, 0,0,0, 'UTC') + INTERVAL '1 month'   AS seg_end
  ),
  tails AS (
    SELECT DISTINCT ON (f.empresa_id)
           f.empresa_id,
           f.chain_hash,
           COUNT(*) OVER (PARTITION BY f.empresa_id) AS cnt
      FROM public.lc_fichajes f, segment_range sr
     WHERE f.timestamp_servidor >= sr.seg_start
       AND f.timestamp_servidor <  sr.seg_end
     ORDER BY f.empresa_id, f.chain_seq DESC
  )
  INSERT INTO public.lc_chain_anchors
         (empresa_id, segment_year, segment_month, final_hash, record_count, sealed_by)
  SELECT t.empresa_id, p_year, p_month, t.chain_hash, t.cnt,
         '00000000-0000-0000-0000-000000000000'::uuid  -- LC_SYSTEM_ACTOR
    FROM tails t
  ON CONFLICT (empresa_id, segment_year, segment_month) DO NOTHING
  RETURNING lc_chain_anchors.empresa_id,
            lc_chain_anchors.final_hash,
            lc_chain_anchors.record_count;
END;
$func$;

-- ============================================================================
-- FUNCTION 2: lc_create_next_partition
-- Creates the partition table for next calendar month on lc_fichajes.
-- Idempotent: returns a no-op message if the partition already exists.
-- Intended to run on day 25 of each month so the partition is ready before
-- month rollover.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lc_create_next_partition()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $func$
DECLARE
  v_start DATE := (date_trunc('month', now() AT TIME ZONE 'UTC') + INTERVAL '1 month')::date;
  v_end   DATE := v_start + INTERVAL '1 month';
  v_name  TEXT := 'lc_fichajes_' || to_char(v_start, 'YYYY_MM');
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = v_name
  ) THEN
    RETURN v_name || ' (already exists — no-op)';
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.lc_fichajes FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end
  );

  RETURN v_name || ' created';
END;
$func$;

-- ============================================================================
-- FUNCTION 3: lc_drop_expired_partition
-- Drops a lc_fichajes_YYYY_MM partition after the 4-year retention window.
-- Four guards must all pass before the DROP executes:
--   1. Name pattern guard — only lc_fichajes_YYYY_MM names accepted
--   2. Retention window guard — partition end must be > 4 years ago
--   3. Anchor guard — every empresa with rows must have a sealed anchor
--   4. Legal hold guard — no active hold rows are unarchived for this segment
-- Writes an audit entry to lc_audit_log on success.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lc_drop_expired_partition(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $func$
DECLARE
  v_year      INT;
  v_month     INT;
  v_seg_start TIMESTAMPTZ;
  v_seg_end   TIMESTAMPTZ;
BEGIN
  -- Guard 1: strict name pattern — only lc_fichajes partitions can be dropped
  IF p_name !~ '^lc_fichajes_[0-9]{4}_[0-9]{2}$' THEN
    RAISE EXCEPTION 'lc_drop_expired_partition: invalid partition name ''%''', p_name;
  END IF;

  v_year  := split_part(p_name, '_', 3)::INT;
  v_month := split_part(p_name, '_', 4)::INT;
  v_seg_start := make_timestamptz(v_year, v_month, 1, 0,0,0, 'UTC');
  v_seg_end   := v_seg_start + INTERVAL '1 month';

  -- Guard 2: entire partition must be outside the 4-year retention window
  IF v_seg_end > now() - INTERVAL '4 years' THEN
    RAISE EXCEPTION 'lc_drop_expired_partition: partition ''%'' is inside the 4-year retention window', p_name;
  END IF;

  -- Guard 3: every empresa with rows must have a sealed anchor for this segment
  IF EXISTS (
    SELECT 1
      FROM (
        SELECT DISTINCT empresa_id
          FROM public.lc_fichajes
         WHERE timestamp_servidor >= v_seg_start
           AND timestamp_servidor <  v_seg_end
      ) e
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.lc_chain_anchors a
        WHERE a.empresa_id    = e.empresa_id
          AND a.segment_year  = v_year
          AND a.segment_month = v_month
     )
  ) THEN
    RAISE EXCEPTION 'lc_drop_expired_partition: one or more empresas have unsealed anchors for ''%''', p_name;
  END IF;

  -- Guard 4: all active holds overlapping this segment must already be archived
  IF EXISTS (
    SELECT 1
      FROM public.lc_legal_holds h
     WHERE h.activo = true
       AND daterange(h.fecha_inicio, h.fecha_fin, '[]')
           && daterange(v_seg_start::date, v_seg_end::date, '[)')
       AND NOT EXISTS (
         SELECT 1
           FROM public.lc_fichajes_hold_archive ar
          WHERE ar.hold_id            = h.id
            AND ar.timestamp_servidor >= v_seg_start
            AND ar.timestamp_servidor <  v_seg_end
       )
  ) THEN
    RAISE EXCEPTION 'lc_drop_expired_partition: active hold(s) not yet archived for ''%'' — archive first', p_name;
  END IF;

  -- All guards passed: drop the partition
  EXECUTE format('DROP TABLE public.%I', p_name);

  -- Audit the drop
  INSERT INTO public.lc_audit_log
         (empresa_id, actor_id, action_type, entity_type, entity_id, reason, metadata)
  VALUES ('00000000-0000-0000-0000-000000000000',
          '00000000-0000-0000-0000-000000000000',
          'partition.drop',
          'lc_fichajes_partition',
          NULL,
          'Scheduled 4-year retention purge',
          jsonb_build_object(
            'partition',     p_name,
            'segment_year',  v_year,
            'segment_month', v_month
          ));

  RETURN p_name || ' dropped';
END;
$func$;

-- ============================================================================
-- FUNCTION 4: lc_verify_chain_segment
-- Walks every row in a empresa/year/month segment in chain_seq order and
-- verifies both the prev_hash link and the recomputed chain_hash.
-- Returns a single row: status ('OK' | 'BROKEN' | 'TAMPERED'), total_rows,
-- broken_at (chain_seq of first bad link, NULL if OK), and a message.
-- Called by the Vercel cron chain verifier and the on-demand verify endpoint.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lc_verify_chain_segment(
  p_empresa_id UUID,
  p_year       INT,
  p_month      INT
)
RETURNS TABLE (
  status     TEXT,
  total_rows BIGINT,
  broken_at  BIGINT,
  message    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $func$
DECLARE
  v_seg_start TIMESTAMPTZ := make_timestamptz(p_year, p_month, 1, 0,0,0, 'UTC');
  v_seg_end   TIMESTAMPTZ := v_seg_start + INTERVAL '1 month';
  v_prev_hash TEXT;
  v_count     BIGINT := 0;
  r           RECORD;
BEGIN
  -- Get expected genesis (prev anchor or SEGMENT_GENESIS)
  SELECT final_hash INTO v_prev_hash
    FROM public.lc_chain_anchors
   WHERE empresa_id = p_empresa_id
     AND (segment_year * 100 + segment_month) <
         (p_year       * 100 + p_month)
   ORDER BY segment_year DESC, segment_month DESC
   LIMIT 1;

  v_prev_hash := COALESCE(v_prev_hash, 'SEGMENT_GENESIS');

  FOR r IN
    SELECT chain_seq, prev_hash, chain_hash,
           record_id, tipo, timestamp_servidor, timestamp_evento,
           empresa_id, centro_id, empleado_id, actor_id,
           accion, ref_correccion, origen_offline, motivo
      FROM public.lc_fichajes
     WHERE empresa_id        = p_empresa_id
       AND timestamp_servidor >= v_seg_start
       AND timestamp_servidor <  v_seg_end
     ORDER BY chain_seq ASC
  LOOP
    v_count := v_count + 1;

    -- Verify prev_hash link
    IF r.prev_hash <> v_prev_hash THEN
      RETURN QUERY SELECT
        'BROKEN'::TEXT,
        v_count,
        r.chain_seq,
        format(
          'prev_hash mismatch at chain_seq=%s: expected %s got %s',
          r.chain_seq, v_prev_hash, r.prev_hash
        );
      RETURN;
    END IF;

    -- Recompute hash and compare
    DECLARE
      v_expected TEXT;
    BEGIN
      v_expected := encode(
        digest(
          public.lc_canonical_payload(
            r.record_id, r.empresa_id, r.centro_id, r.empleado_id,
            r.actor_id, r.tipo, r.accion, r.ref_correccion,
            r.timestamp_evento, r.timestamp_servidor,
            r.origen_offline, r.motivo, r.prev_hash
          ),
          'sha256'
        ),
        'hex'
      );

      IF r.chain_hash <> v_expected THEN
        RETURN QUERY SELECT
          'TAMPERED'::TEXT,
          v_count,
          r.chain_seq,
          format('chain_hash mismatch at chain_seq=%s', r.chain_seq);
        RETURN;
      END IF;
    END;

    v_prev_hash := r.chain_hash;
  END LOOP;

  RETURN QUERY SELECT
    'OK'::TEXT,
    v_count,
    NULL::BIGINT,
    format('Segment %s-%s verified: %s records', p_year, p_month, v_count);
END;
$func$;

-- ============================================================================
-- REVOKE / GRANT
-- Strip EXECUTE from PUBLIC, anon, authenticated.
-- Grant only to service_role (Vercel cron uses the service key).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.lc_seal_month_anchors(INT, INT)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lc_create_next_partition()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lc_drop_expired_partition(TEXT)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lc_verify_chain_segment(UUID, INT, INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lc_seal_month_anchors(INT, INT)          TO service_role;
GRANT EXECUTE ON FUNCTION public.lc_create_next_partition()                TO service_role;
GRANT EXECUTE ON FUNCTION public.lc_drop_expired_partition(TEXT)           TO service_role;
GRANT EXECUTE ON FUNCTION public.lc_verify_chain_segment(UUID, INT, INT)   TO service_role;

-- ============================================================================
-- CRON SCHEDULE (implemented in Vercel — see src/app/api/laborcontrol/cron/*.ts)
-- pg_cron is NOT available on Supabase Free plan. Schedules below are
-- documentation only; Vercel Cron triggers the actual HTTP endpoints.
--
-- Day 25 of each month, 03:00 UTC:
--   SELECT public.lc_create_next_partition();
--   (Creates next month's partition so it's ready before month rollover)
--
-- Day 1 of each month, 04:00 UTC (in sequence):
--   1. SELECT * FROM public.lc_seal_month_anchors(year, prev_month);
--      (Seals last month's chain segment; writes to lc_audit_log action_type='chain.anchor')
--   2. [App layer: archive held empresa rows into lc_fichajes_hold_archive if any partition
--      is eligible for drop — must complete before step 3]
--   3. SELECT public.lc_drop_expired_partition('lc_fichajes_YYYY_MM');
--      (Drops partitions older than 4 years, only if all four guards pass)
--
-- Day 1 of each month, 04:30 UTC:
--   GET /api/laborcontrol/chain/verify
--   (Chain verifier run — calls lc_verify_chain_segment per empresa per month
--    and alerts on any broken or tampered segments)
-- ============================================================================
