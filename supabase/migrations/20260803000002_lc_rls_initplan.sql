-- Performance: hoistear auth.uid() y get_mi_empresa_id() en las policies de
-- laborcontrol (advisor `auth_rls_initplan`, 7 avisos).
--
-- PROBLEMA
-- Las 7 policies afectadas llaman a `auth.uid()` dentro de un EXISTS correlacionado
-- (referencia a `lc_fichajes.empresa_id`), asi que el subplan se re-ejecuta POR FILA
-- y arrastra consigo la llamada a la funcion. Igual con `get_mi_empresa_id()`, que
-- ademas consulta `perfiles_admin` en cada evaluacion.
--
-- Envolver la llamada en `(SELECT ...)` permite a Postgres promoverla a InitPlan:
-- se evalua UNA vez al arrancar el plan y el resultado se reutiliza para todas las
-- filas. La expresion es semanticamente identica — ambas funciones son STABLE y no
-- reciben argumentos dependientes de la fila — asi que no hay cambio de conducta ni
-- de superficie de seguridad. Es puro hoisting.
--
-- POR QUE AHORA, CON POCO VOLUMEN
-- `lc_fichajes` esta particionada por mes precisamente porque esta disenada para
-- crecer sin techo: cada entrada y salida de cada empleado, con retencion legal.
-- Pero el motivo determinante no es el volumen de hoy — es que
-- `lc_create_next_partition()` lleva la forma SIN envolver incrustada en su cuerpo.
-- Cada mes que pasa, el cron crea una particion nueva con DOS policies defectuosas
-- mas. El problema no se queda quieto: se acumula de forma monotona, y cuanto mas
-- tarde se arregle, mas particiones habra que reescribir.
--
-- Por eso esta migracion hace DOS cosas, y la segunda es la que de verdad importa:
--   1. corrige las 7 policies existentes;
--   2. corrige el GENERADOR, para que las particiones futuras nazcan bien.
--
-- Se usa ALTER POLICY y no DROP + CREATE: modifica la expresion in situ, sin que
-- exista en ningun momento — ni siquiera dentro de la transaccion — una ventana en
-- la que la tabla quede sin esa policy.
--
-- El resto del proyecto (perfiles_admin, promociones) ya usaba la forma envuelta;
-- a estas siete se les habia escapado.

-- ── lc_fichajes (tabla padre) ───────────────────────────────────────────────

ALTER POLICY "Admin ve fichajes de su empresa" ON public.lc_fichajes
  USING (
    empresa_id = (SELECT get_mi_empresa_id())
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin pa
       WHERE pa.id         = (SELECT auth.uid())
         AND pa.empresa_id = lc_fichajes.empresa_id
    )
  );

ALTER POLICY "RLT ve fichajes de su centro" ON public.lc_fichajes
  USING (
    empresa_id = (SELECT get_mi_empresa_id())
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id    = (SELECT auth.uid())
         AND r.empresa_id = lc_fichajes.empresa_id
         AND r.centro_id  = lc_fichajes.centro_id
         AND r.activo
    )
  );

-- ── lc_fichajes_2026_07 ─────────────────────────────────────────────────────
-- Las particiones NO heredan las policies del padre: hay que repetirlas una a una.

ALTER POLICY "Admin ve fichajes de su empresa (2026_07)" ON public.lc_fichajes_2026_07
  USING (
    empresa_id = (SELECT get_mi_empresa_id())
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin pa
       WHERE pa.id         = (SELECT auth.uid())
         AND pa.empresa_id = lc_fichajes_2026_07.empresa_id
    )
  );

ALTER POLICY "RLT ve fichajes de su centro (2026_07)" ON public.lc_fichajes_2026_07
  USING (
    empresa_id = (SELECT get_mi_empresa_id())
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id    = (SELECT auth.uid())
         AND r.empresa_id = lc_fichajes_2026_07.empresa_id
         AND r.centro_id  = lc_fichajes_2026_07.centro_id
         AND r.activo
    )
  );

-- ── lc_fichajes_2026_08 ─────────────────────────────────────────────────────

ALTER POLICY "Admin ve fichajes de su empresa (2026_08)" ON public.lc_fichajes_2026_08
  USING (
    empresa_id = (SELECT get_mi_empresa_id())
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin pa
       WHERE pa.id         = (SELECT auth.uid())
         AND pa.empresa_id = lc_fichajes_2026_08.empresa_id
    )
  );

ALTER POLICY "RLT ve fichajes de su centro (2026_08)" ON public.lc_fichajes_2026_08
  USING (
    empresa_id = (SELECT get_mi_empresa_id())
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id    = (SELECT auth.uid())
         AND r.empresa_id = lc_fichajes_2026_08.empresa_id
         AND r.centro_id  = lc_fichajes_2026_08.centro_id
         AND r.activo
    )
  );

-- ── lc_horas_extra ──────────────────────────────────────────────────────────
-- Solo la policy del RLT sale en el advisor (es la unica con auth.uid()), pero las
-- otras tres llaman igualmente a get_mi_empresa_id() por fila. El advisor no las ve:
-- su regla busca `auth.<fn>()` literal y no reconoce funciones envoltorio. Ya que la
-- tabla se toca aqui, se corrigen las cuatro.

ALTER POLICY "RLT ve horas_extra de su centro" ON public.lc_horas_extra
  USING (
    empresa_id = (SELECT get_mi_empresa_id())
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id    = (SELECT auth.uid())
         AND r.empresa_id = lc_horas_extra.empresa_id
         AND r.centro_id  = lc_horas_extra.centro_id
         AND r.activo
    )
  );

ALTER POLICY "Admin ve lc_horas_extra" ON public.lc_horas_extra
  USING (empresa_id = (SELECT get_mi_empresa_id()));

ALTER POLICY "Admin actualiza horas_extra" ON public.lc_horas_extra
  USING      (empresa_id = (SELECT get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

ALTER POLICY "Admin crea horas_extra" ON public.lc_horas_extra
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));


-- ============================================================================
-- El generador: sin esto, la particion del mes que viene renace con el defecto.
--
-- Identico al cuerpo definido en 20260725000001_partition_rls.sql salvo por las
-- llamadas envueltas en (SELECT ...). Se mantienen intactos el guard de
-- idempotencia, los REVOKE/GRANT y el valor de retorno.
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
