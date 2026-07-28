-- Migration: 20260730000001_fix_tpv_turno_before_insert_search_path.sql
-- Purpose: Add 'extensions' to search_path of tpv_turno_before_insert().
--
-- Root cause: 20260725000003 applied SET search_path = public, pg_catalog to
--   tpv_turno_before_insert() — but the function calls digest() from pgcrypto,
--   which lives in the 'extensions' schema. Without 'extensions' in the path,
--   digest() is not resolvable at runtime.
--
-- The function is operational because Supabase includes 'extensions' in the
-- session search_path by default, but the explicit declaration was incorrect.
-- This migration aligns the declared path with the actual runtime requirement.
--
-- No body change — ALTER FUNCTION only.
-- Norma: Supabase Security Advisory 0011 (mutable search_path)
-- Gap:   GAP-DB-01

ALTER FUNCTION public.tpv_turno_before_insert()
  SET search_path = public, extensions, pg_catalog;
