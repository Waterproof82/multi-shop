-- ============================================================================
-- Migration: 20260726000001_fix_lc_canonical_payload_search_path.sql
-- Purpose: Fix digest() not found in lc_canonical_payload and
--          lc_verify_chain_segment — add pg_catalog to search_path.
--
-- Root cause: lc_canonical_payload() was recreated in 20260724000005 without
--   SET search_path, so pgcrypto's digest() is not resolvable at runtime.
--   lc_verify_chain_segment() had SET search_path = 'public' (missing pg_catalog).
--   Both functions call digest() directly, which requires pg_catalog in scope.
-- ============================================================================

-- ── lc_canonical_payload ─────────────────────────────────────────────────────
-- Body identical to 20260724000005; only adds SET search_path = public, extensions, pg_catalog

CREATE OR REPLACE FUNCTION public.lc_canonical_payload(
  p_record_id          UUID,
  p_empresa_id         UUID,
  p_centro_id          UUID,
  p_empleado_id        UUID,
  p_actor_id           UUID,
  p_tipo               TEXT,
  p_accion             TEXT,
  p_ref_correccion     UUID,
  p_timestamp_evento   TIMESTAMPTZ,
  p_timestamp_servidor TIMESTAMPTZ,
  p_motivo             TEXT,
  p_prev_hash          TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions, pg_catalog
AS $func$
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
    || '|origen_offline=false'    -- column dropped; was always false; hardcoded for backward compat
    || '|prev_hash='              || p_prev_hash
    || '|record_id='              || p_record_id::text
    || '|ref_correccion='         || COALESCE(p_ref_correccion::text, v_null)
    || '|timestamp_evento_utc='   || to_char(p_timestamp_evento   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    || '|timestamp_servidor_utc=' || to_char(p_timestamp_servidor AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    || '|tipo='                   || p_tipo;
END;
$func$;

-- Grants unchanged — still restricted to service_role
REVOKE EXECUTE ON FUNCTION public.lc_canonical_payload(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, UUID,
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lc_canonical_payload(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, UUID,
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;


-- ── lc_verify_chain_segment ──────────────────────────────────────────────────
-- Body identical to 20260724000005; fixes search_path from 'public' to public, pg_catalog

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
SET search_path = public, extensions, pg_catalog
AS $func$
DECLARE
  v_seg_start TIMESTAMPTZ := make_timestamptz(p_year, p_month, 1, 0,0,0, 'UTC');
  v_seg_end   TIMESTAMPTZ := v_seg_start + INTERVAL '1 month';
  v_prev_hash TEXT;
  v_count     BIGINT := 0;
  r           RECORD;
BEGIN
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
           accion, ref_correccion, motivo
      FROM public.lc_fichajes
     WHERE empresa_id         = p_empresa_id
       AND timestamp_servidor >= v_seg_start
       AND timestamp_servidor <  v_seg_end
     ORDER BY chain_seq ASC
  LOOP
    v_count := v_count + 1;

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

    DECLARE
      v_expected TEXT;
    BEGIN
      v_expected := encode(
        digest(
          public.lc_canonical_payload(
            r.record_id, r.empresa_id, r.centro_id, r.empleado_id,
            r.actor_id, r.tipo, r.accion, r.ref_correccion,
            r.timestamp_evento, r.timestamp_servidor,
            r.motivo, r.prev_hash
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

REVOKE EXECUTE ON FUNCTION public.lc_verify_chain_segment(UUID, INT, INT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lc_verify_chain_segment(UUID, INT, INT)
  TO service_role;
