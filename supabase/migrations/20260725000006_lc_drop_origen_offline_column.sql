-- ============================================================================
-- Migration: 20260725000006_lc_drop_origen_offline_column.sql
-- Purpose:   Formally drop origen_offline from lc_fichajes schema.
--
-- History: The column was removed manually from production after migration
-- 20260724000002, and migration 20260724000005 updated the functions to no
-- longer reference it. This migration ensures a fresh install matches
-- production by dropping the column declaratively.
-- ============================================================================

ALTER TABLE public.lc_fichajes DROP COLUMN IF EXISTS origen_offline;
