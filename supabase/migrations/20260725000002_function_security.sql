-- ============================================================================
-- Migration: 20260725000002_function_security.sql
-- Purpose: Add SET search_path = public, pg_catalog to trigger functions that
--          were missing it, and REVOKE EXECUTE FROM anon (defense-in-depth).
--
-- Context:
--   - 20260710000001 and 20260710000002 already fixed search_path + REVOKEs
--     for 16 analytics/tpv functions.
--   - 20260724000004 already fixed all 4 lc_* SECURITY DEFINER functions.
--   - This migration targets the remaining 3 trigger functions:
--       1. pedidos_block_delete()       — 20260722000002 (no schema, no search_path)
--       2. lc_immutable_guard()         — 20260724000002 (no search_path)
--       3. lc_fichajes_chain_before()   — last updated in 20260724000005
-- ============================================================================


-- ── pedidos_block_delete ─────────────────────────────────────────────────────
-- Originally: 20260722000002_pedidos_block_delete.sql
-- Added: public schema qualifier, SET search_path

CREATE OR REPLACE FUNCTION public.pedidos_block_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'pedidos: DELETE no permitido (Art.66 LGT — retención fiscal mínima 5 años)';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pedidos_block_delete() FROM anon;


-- ── lc_immutable_guard ───────────────────────────────────────────────────────
-- Originally: 20260724000002_lc_fichajes_chain.sql (section 6)
-- Added: SET search_path

CREATE OR REPLACE FUNCTION public.lc_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $func$
BEGIN
  RAISE EXCEPTION
    'lc_fichajes: records are immutable — UPDATE and DELETE are prohibited (tabla: %)',
    TG_TABLE_NAME;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.lc_immutable_guard() FROM anon;


-- ── lc_fichajes_chain_before ─────────────────────────────────────────────────
-- Last updated: 20260724000005_lc_remove_origen_offline.sql (section 3)
-- Full body copied verbatim; added SET search_path only.

CREATE OR REPLACE FUNCTION public.lc_fichajes_chain_before()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $func$
DECLARE
  v_prev_hash TEXT;
  v_payload   TEXT;
BEGIN
  -- Serialize chain writes per empresa
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(NEW.empresa_id::text), 1, 16))::bit(64)::bigint
  );

  -- Find prev_hash by chain_seq (monotonic) — never by timestamp
  SELECT chain_hash INTO v_prev_hash
    FROM public.lc_fichajes
   WHERE empresa_id = NEW.empresa_id
   ORDER BY chain_seq DESC
   LIMIT 1;

  IF v_prev_hash IS NULL THEN
    SELECT final_hash INTO v_prev_hash
      FROM public.lc_chain_anchors
     WHERE empresa_id = NEW.empresa_id
     ORDER BY segment_year DESC, segment_month DESC
     LIMIT 1;
    v_prev_hash := COALESCE(v_prev_hash, 'SEGMENT_GENESIS');
  END IF;

  NEW.prev_hash := v_prev_hash;

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
    NEW.motivo,
    v_prev_hash
  );

  NEW.chain_hash := encode(digest(v_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.lc_fichajes_chain_before() FROM anon;


-- ============================================================================
-- Rollback (run manually if needed):
--
-- GRANT EXECUTE ON FUNCTION public.pedidos_block_delete()     TO anon;
-- GRANT EXECUTE ON FUNCTION public.lc_immutable_guard()       TO anon;
-- GRANT EXECUTE ON FUNCTION public.lc_fichajes_chain_before() TO anon;
--
-- (Restore function bodies without SET search_path from their source migrations)
-- ============================================================================
