-- Migration: 20260729000001_empresas_verifactu_mode.sql
-- Purpose: Add verifactu_mode flag to empresas table.
--   Formalizes the operational mode per Art. 12 RD 1007/2023.
--   Phase 2 (VERI*FACTU XML + submission) is out of scope; reserved via 'verifactu' value.
--
-- No RLS change: empresas already has admin-only policies via get_mi_empresa_id().
-- No GRANT change: service_role has full access; authenticated has SELECT/UPDATE via existing policies.
-- DEFAULT 'no-verifactu' applies to all existing rows automatically — no backfill needed.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS verifactu_mode TEXT NOT NULL DEFAULT 'no-verifactu'
  CHECK (verifactu_mode IN ('no-verifactu', 'verifactu'));
