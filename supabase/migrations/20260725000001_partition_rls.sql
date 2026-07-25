-- ============================================================================
-- Migration: 20260725000001_partition_rls.sql
-- Purpose: Enable RLS on existing lc_fichajes partitions.
--          Partitions do NOT inherit RLS from their parent table in PostgreSQL.
--          Mirrors the policies defined in 20260724000002_lc_fichajes_chain.sql (section 7).
-- Also: Update lc_create_next_partition() to auto-apply RLS on every new partition.
-- ============================================================================


-- ── lc_fichajes_2026_07 ──────────────────────────────────────────────────────

ALTER TABLE public.lc_fichajes_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_fichajes_2026_07"
  ON public.lc_fichajes_2026_07 FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve fichajes de su empresa (2026_07)"
  ON public.lc_fichajes_2026_07 FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin pa
       WHERE pa.id         = auth.uid()
         AND pa.empresa_id = lc_fichajes_2026_07.empresa_id
    )
  );

CREATE POLICY "RLT ve fichajes de su centro (2026_07)"
  ON public.lc_fichajes_2026_07 FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id    = auth.uid()
         AND r.empresa_id = lc_fichajes_2026_07.empresa_id
         AND r.centro_id  = lc_fichajes_2026_07.centro_id
         AND r.activo
    )
  );

REVOKE UPDATE, DELETE ON public.lc_fichajes_2026_07 FROM authenticated;
GRANT SELECT, INSERT ON public.lc_fichajes_2026_07 TO service_role;
GRANT SELECT         ON public.lc_fichajes_2026_07 TO authenticated;


-- ── lc_fichajes_2026_08 ──────────────────────────────────────────────────────

ALTER TABLE public.lc_fichajes_2026_08 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to lc_fichajes_2026_08"
  ON public.lc_fichajes_2026_08 FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve fichajes de su empresa (2026_08)"
  ON public.lc_fichajes_2026_08 FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin pa
       WHERE pa.id         = auth.uid()
         AND pa.empresa_id = lc_fichajes_2026_08.empresa_id
    )
  );

CREATE POLICY "RLT ve fichajes de su centro (2026_08)"
  ON public.lc_fichajes_2026_08 FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id    = auth.uid()
         AND r.empresa_id = lc_fichajes_2026_08.empresa_id
         AND r.centro_id  = lc_fichajes_2026_08.centro_id
         AND r.activo
    )
  );

REVOKE UPDATE, DELETE ON public.lc_fichajes_2026_08 FROM authenticated;
GRANT SELECT, INSERT ON public.lc_fichajes_2026_08 TO service_role;
GRANT SELECT         ON public.lc_fichajes_2026_08 TO authenticated;


-- ============================================================================
-- Unit C: Update lc_create_next_partition() to auto-apply RLS on new partitions.
-- Every partition born from cron now gets RLS + policies atomically,
-- preventing the same exposure seen in _2026_07 and _2026_08 above.
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

  -- Create the partition table
  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.lc_fichajes FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end
  );

  -- Enable RLS (partitions do not inherit from parent)
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_name);

  -- Anon: deny all access
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)',
    'No direct anon access to ' || v_name, v_name
  );

  -- Admin: empresa-scoped SELECT
  EXECUTE format(
    $policy$
    CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
    USING (
      empresa_id = get_mi_empresa_id()
      AND EXISTS (
        SELECT 1 FROM public.perfiles_admin pa
         WHERE pa.id         = auth.uid()
           AND pa.empresa_id = %I.empresa_id
      )
    )
    $policy$,
    'Admin ve fichajes de su empresa (' || v_name || ')', v_name, v_name
  );

  -- RLT: centro-scoped SELECT
  EXECUTE format(
    $policy$
    CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
    USING (
      empresa_id = get_mi_empresa_id()
      AND EXISTS (
        SELECT 1 FROM public.lc_rlt_asignaciones r
         WHERE r.user_id    = auth.uid()
           AND r.empresa_id = %I.empresa_id
           AND r.centro_id  = %I.centro_id
           AND r.activo
      )
    )
    $policy$,
    'RLT ve fichajes de su centro (' || v_name || ')', v_name, v_name, v_name
  );

  -- Revoke mutation from authenticated; grant to service_role
  EXECUTE format('REVOKE UPDATE, DELETE ON public.%I FROM authenticated', v_name);
  EXECUTE format('GRANT SELECT, INSERT ON public.%I TO service_role', v_name);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_name);

  RETURN v_name || ' created';
END;
$func$;


-- ============================================================================
-- Rollback (run manually if needed):
--
-- ALTER TABLE public.lc_fichajes_2026_07 DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "No direct anon access to lc_fichajes_2026_07" ON public.lc_fichajes_2026_07;
-- DROP POLICY IF EXISTS "Admin ve fichajes de su empresa (2026_07)"     ON public.lc_fichajes_2026_07;
-- DROP POLICY IF EXISTS "RLT ve fichajes de su centro (2026_07)"        ON public.lc_fichajes_2026_07;
--
-- ALTER TABLE public.lc_fichajes_2026_08 DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "No direct anon access to lc_fichajes_2026_08" ON public.lc_fichajes_2026_08;
-- DROP POLICY IF EXISTS "Admin ve fichajes de su empresa (2026_08)"     ON public.lc_fichajes_2026_08;
-- DROP POLICY IF EXISTS "RLT ve fichajes de su centro (2026_08)"        ON public.lc_fichajes_2026_08;
--
-- (Restore previous lc_create_next_partition() body from 20260724000004_lc_functions_crons.sql)
-- ============================================================================
