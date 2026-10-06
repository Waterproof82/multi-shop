-- ============================================================================
-- Mover get_mi_empresa_id() del schema `public` a `private`.
--
-- PROBLEMA
-- Advisor 0029 (authenticated_security_definer_function_executable): la
-- función es SECURITY DEFINER y `authenticated` tiene EXECUTE, así que queda
-- publicada en /rest/v1/rpc/get_mi_empresa_id. Hasta ahora era una excepción
-- documentada: las policies RLS la invocan en nombre del usuario, así que
-- revocar EXECUTE rompería todas las policies de tenant.
--
-- SOLUCIÓN
-- `authenticated` sigue necesitando EXECUTE, pero la función no tiene por qué
-- vivir en un schema expuesto por PostgREST. `private` no está en los
-- "Exposed schemas" de la Data API, así que deja de ser llamable por RPC y el
-- advisor queda limpio sin tocar ningún privilegio.
--
-- POR QUÉ ES SEGURO
-- - Las policies y vistas guardan la función por OID, no por nombre: siguen
--   funcionando tras el ALTER ... SET SCHEMA sin recrearlas.
-- - El ACL de la función viaja con ella (los GRANT se conservan); se
--   reafirman abajo por si se despliega desde cero.
-- - El cuerpo ya califica `public.perfiles_admin`; su search_path no cambia.
-- - Lo ÚNICO que guarda el nombre como texto es el GENERADOR
--   lc_create_next_partition() (lo usa en EXECUTE format(...)). Se redefine
--   aquí con el nombre calificado; si no, la partición del mes siguiente
--   fallaría con "function get_mi_empresa_id() does not exist".
--
-- A PARTIR DE AHORA: las policies nuevas deben escribir
-- `private.get_mi_empresa_id()` (sin calificar no resuelve: `private` no está
-- en el search_path).
-- ============================================================================

-- 1. Schema privado: solo uso, sin CREATE, y nunca para anon.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- 2. Mover la función (policies/vistas siguen apuntando a ella por OID).
ALTER FUNCTION public.get_mi_empresa_id() SET SCHEMA private;

REVOKE EXECUTE ON FUNCTION private.get_mi_empresa_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.get_mi_empresa_id() FROM anon;
GRANT  EXECUTE ON FUNCTION private.get_mi_empresa_id() TO authenticated;
GRANT  EXECUTE ON FUNCTION private.get_mi_empresa_id() TO service_role;

-- 3. Generador de particiones — idéntico a
-- 20260911000001_fix_lc_create_next_partition_restrictive.sql salvo por el
-- nombre calificado `private.get_mi_empresa_id()`.
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
  -- (SELECT auth.uid()) / (SELECT private.get_mi_empresa_id()) para que
  -- Postgres las promueva a InitPlan y no las re-evalue por fila.
  EXECUTE format(
    $policy$
    CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
    USING (
      empresa_id = (SELECT private.get_mi_empresa_id())
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
      empresa_id = (SELECT private.get_mi_empresa_id())
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

-- 4. Guardia: ninguna otra función puede seguir llamando al nombre sin
-- calificar (fallaría en tiempo de ejecución). check_rls_policy_hygiene solo
-- lo usa dentro de un LIKE '%get_mi_empresa_id%', que sigue casando.
-- Si esto aborta, hay una función creada fuera de las migraciones que hay que
-- redefinir aquí también.
DO $guard$
DECLARE
  v_fns TEXT;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname, ', ')
    INTO v_fns
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosrc ~ '(?<!private\.)get_mi_empresa_id\s*\('
     AND p.proname NOT IN ('get_mi_empresa_id', 'check_rls_policy_hygiene')
     AND n.nspname NOT IN ('pg_catalog', 'information_schema');

  IF v_fns IS NOT NULL THEN
    RAISE EXCEPTION 'Funciones que llaman a get_mi_empresa_id() sin calificar: %', v_fns;
  END IF;
END;
$guard$;
