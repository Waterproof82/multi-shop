-- ============================================================================
-- Fix: lc_create_next_partition() generaba la policy "no anon access" como
-- PERMISSIVE en vez de RESTRICTIVE.
--
-- 20260731000008_convert_anon_deny_policies_to_restrictive.sql corrigio las
-- particiones YA EXISTENTES en ese momento (lc_fichajes_2026_07 y _08), pero
-- nunca toco el GENERADOR. Cada particion nueva creada por el cron mensual
-- (lc_create_next_partition, via pg_cron) volvia a nacer con la policy
-- PERMISSIVE — el mismo patron de bug raiz del incidente RLS del 2026-07-31,
-- solo que reintroducido cada mes. Confirmado por
-- e2e/compliance/rls-policy-hygiene.spec.ts al fallar sobre lc_fichajes_2026_09.
--
-- Este migration:
--   1. Corrige la policy ya creada sobre lc_fichajes_2026_09.
--   2. Redefine el generador con "AS RESTRICTIVE" para que las particiones
--      futuras (2026_10 en adelante) nazcan correctas.
-- ============================================================================

-- 1. Particion ya afectada
DROP POLICY IF EXISTS "No direct anon access to lc_fichajes_2026_09" ON public.lc_fichajes_2026_09;
CREATE POLICY "No direct anon access to lc_fichajes_2026_09" ON public.lc_fichajes_2026_09
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- 2. Generador — identico a 20260803000002_lc_rls_initplan.sql salvo por
-- "AS RESTRICTIVE" en la policy de anon.
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

  -- Anon: deny all access. AS RESTRICTIVE — se combina con AND, asi que
  -- ninguna policy permisiva anadida despues puede anularla.
  EXECUTE format(
    'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)',
    'No direct anon access to ' || v_name, v_name
  );

  -- Admin: empresa-scoped SELECT.
  -- (SELECT auth.uid()) / (SELECT get_mi_empresa_id()) para que Postgres las
  -- promueva a InitPlan y no las re-evalue por fila dentro del EXISTS.
  EXECUTE format(
    $policy$
    CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
    USING (
      empresa_id = (SELECT get_mi_empresa_id())
      AND EXISTS (
        SELECT 1 FROM public.perfiles_admin pa
         WHERE pa.id         = (SELECT auth.uid())
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
      empresa_id = (SELECT get_mi_empresa_id())
      AND EXISTS (
        SELECT 1 FROM public.lc_rlt_asignaciones r
         WHERE r.user_id    = (SELECT auth.uid())
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

REVOKE EXECUTE ON FUNCTION public.lc_create_next_partition() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lc_create_next_partition() FROM anon;
REVOKE EXECUTE ON FUNCTION public.lc_create_next_partition() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.lc_create_next_partition() TO service_role;
