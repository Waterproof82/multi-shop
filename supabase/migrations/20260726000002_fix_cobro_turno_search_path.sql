-- Fix: tpv_cobro_before_insert and tpv_turno_before_insert need 'extensions'
-- in search_path so that pgcrypto's digest() is resolvable at runtime.
--
-- Root cause: migration 20260725000003_revoke_and_search_path.sql applied
--   ALTER FUNCTION ... SET search_path = public, pg_catalog
-- overwriting the correct 'public, extensions' set by earlier migrations.
-- pgcrypto lives in schema 'extensions' in Supabase, not in pg_catalog.
--
-- Affected: tpv_cobro_before_insert (Sentry error 2026-07-26)
--           tpv_turno_before_insert (same pattern, same risk)
--
-- Fix: add 'extensions' back. Using 'public, extensions, pg_catalog' to
-- satisfy both pgcrypto (extensions) and standard operators (pg_catalog).

ALTER FUNCTION public.tpv_cobro_before_insert()
  SET search_path = public, extensions, pg_catalog;

ALTER FUNCTION public.tpv_turno_before_insert()
  SET search_path = public, extensions, pg_catalog;
