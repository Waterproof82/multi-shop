-- Migration: 20260731000001_rgpd_purge_log.sql
-- Purpose: Audit trail for RGPD data retention purge executions.
--
-- Closes GAP-RGPD-01: accountability gap (Art. 5(2) RGPD).
-- Without this table, there is no persistent evidence that the monthly
-- Vercel Cron executed the purge — making it impossible to demonstrate
-- compliance to a regulator (AEPD) on inspection.
--
-- Design:
--   - Global table (no empresa_id) — purge is cross-tenant by design.
--   - INSERT via service_role from /api/cron/rgpd-purge route only.
--   - SELECT available to authenticated (admin visibility in /tpv/legal).
--   - No UPDATE/DELETE — this is an immutable audit log.

CREATE TABLE IF NOT EXISTS public.rgpd_purge_log (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  executed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anonymized_count INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL CHECK (status IN ('ok', 'error')),
  error_message    TEXT,
  triggered_by     TEXT        NOT NULL DEFAULT 'vercel-cron'
);

-- Immutable audit log — no UPDATE or DELETE allowed
CREATE OR REPLACE FUNCTION public.rgpd_purge_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'rgpd_purge_log es inmutable (Art. 5(2) RGPD — accountability)';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rgpd_purge_log_immutable() FROM PUBLIC;

CREATE TRIGGER rgpd_purge_log_no_update
  BEFORE UPDATE ON public.rgpd_purge_log
  FOR EACH ROW EXECUTE FUNCTION public.rgpd_purge_log_immutable();

CREATE TRIGGER rgpd_purge_log_no_delete
  BEFORE DELETE ON public.rgpd_purge_log
  FOR EACH ROW EXECUTE FUNCTION public.rgpd_purge_log_immutable();

-- RLS
ALTER TABLE public.rgpd_purge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to rgpd_purge_log"
  ON public.rgpd_purge_log FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Authenticated lee rgpd_purge_log"
  ON public.rgpd_purge_log FOR SELECT TO authenticated
  USING (true);

-- Explicit grants (required for Supabase Data API)
GRANT SELECT ON public.rgpd_purge_log TO authenticated;
GRANT SELECT, INSERT ON public.rgpd_purge_log TO service_role;

-- Index for fast "last purge" query
CREATE INDEX IF NOT EXISTS idx_rgpd_purge_log_executed_at
  ON public.rgpd_purge_log (executed_at DESC);
