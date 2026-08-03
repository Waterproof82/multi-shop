-- ============================================================================
-- Smoke tests: funciones DB que usan digest() (pgcrypto)
--
-- Propósito: verificar que toda función que depende de pgcrypto puede ser
-- invocada correctamente tras aplicar migraciones. Captura la clase de error:
--   "function digest(bytea, unknown) does not exist"
-- que ocurre cuando SET search_path no incluye el schema 'extensions' de Supabase.
--
-- Cuándo ejecutar:
--   Después de CADA `supabase db push` o `supabase migration up`.
--   Si falla alguno de estos tests, la migración rompió algo — revertir.
--
-- Cómo ejecutar:
--   pnpm db:smoke
--   (equivale a: supabase db query --file supabase/tests/smoke-db-functions.sql --linked)
-- ============================================================================

DO $$
DECLARE
  dummy       UUID    := '00000000-0000-0000-0000-000000000099';
  result_text TEXT;
  result_len  INT;
BEGIN

  -- ── 1. pgcrypto reachable ─────────────────────────────────────────────────
  -- Verifica que digest() es invocable desde SQL (schema extensions en scope).
  -- Si falla aquí: pgcrypto no está habilitada o el search_path de la sesión
  -- no incluye extensions. Todos los tests siguientes también fallarán.

  result_text := encode(digest('smoke-test-pgcrypto', 'sha256'), 'hex');
  IF length(result_text) <> 64 THEN
    RAISE EXCEPTION '[SMOKE FAIL] digest() devolvió longitud inesperada: % (expected 64)', length(result_text);
  END IF;
  RAISE NOTICE '[SMOKE OK] digest() reachable — schema extensions en scope';


  -- ── 2. lc_canonical_payload ───────────────────────────────────────────────
  -- Función que genera el payload canonico del fichaje y llama digest()
  -- internamente para el hash del motivo. Usa SET search_path = public,
  -- extensions, pg_catalog. Fix aplicado en 20260726000001.

  result_text := public.lc_canonical_payload(
    dummy,                          -- p_record_id
    dummy,                          -- p_empresa_id
    dummy,                          -- p_centro_id
    dummy,                          -- p_empleado_id
    NULL,                           -- p_actor_id (nullable)
    'entrada',                      -- p_tipo
    'fichaje_entrada',              -- p_accion
    NULL,                           -- p_ref_correccion (nullable)
    now() AT TIME ZONE 'UTC',       -- p_timestamp_evento
    now() AT TIME ZONE 'UTC',       -- p_timestamp_servidor
    'smoke-test-motivo',            -- p_motivo
    'SEGMENT_GENESIS'               -- p_prev_hash
  );

  IF result_text IS NULL THEN
    RAISE EXCEPTION '[SMOKE FAIL] lc_canonical_payload devolvió NULL';
  END IF;
  IF NOT starts_with(result_text, 'v1|') THEN
    RAISE EXCEPTION '[SMOKE FAIL] lc_canonical_payload: payload no empieza por v1|: %', left(result_text, 80);
  END IF;
  IF NOT (result_text LIKE '%|motivo_sha256=%') THEN
    RAISE EXCEPTION '[SMOKE FAIL] lc_canonical_payload: falta motivo_sha256 en payload (digest() no funcionó): %', left(result_text, 120);
  END IF;

  RAISE NOTICE '[SMOKE OK] lc_canonical_payload — payload válido (% chars)', length(result_text);


  -- ── 3. lc_canonical_payload con motivo NULL ───────────────────────────────
  -- Caso borde: motivo nulo debe producir \N en el payload, no explotar.

  result_text := public.lc_canonical_payload(
    dummy, dummy, dummy, dummy, NULL,
    'salida', 'fichaje_salida', NULL,
    now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC',
    NULL,                          -- p_motivo = NULL
    'SEGMENT_GENESIS'
  );

  IF result_text IS NULL OR NOT starts_with(result_text, 'v1|') THEN
    RAISE EXCEPTION '[SMOKE FAIL] lc_canonical_payload con motivo NULL devolvió resultado inesperado';
  END IF;
  RAISE NOTICE '[SMOKE OK] lc_canonical_payload con motivo NULL — OK';


  -- ── 4. lc_verify_chain_segment ────────────────────────────────────────────
  -- Llama digest() internamente para recalcular chain_hash de cada fila.
  -- Para empresa inexistente devuelve 0 filas con status OK.
  -- Fix: SET search_path = public, extensions, pg_catalog (20260726000001).

  DECLARE
    seg_status TEXT;
    seg_rows   BIGINT;
    found_row  BOOLEAN := FALSE;
  BEGIN
    FOR seg_status, seg_rows IN
      SELECT status, total_rows
        FROM public.lc_verify_chain_segment(dummy, 2026, 7)
    LOOP
      found_row := TRUE;
      IF seg_status NOT IN ('OK', 'BROKEN', 'TAMPERED') THEN
        RAISE EXCEPTION '[SMOKE FAIL] lc_verify_chain_segment: status inesperado: %', seg_status;
      END IF;
    END LOOP;

    IF NOT found_row THEN
      RAISE EXCEPTION '[SMOKE FAIL] lc_verify_chain_segment no devolvió ninguna fila';
    END IF;

    RAISE NOTICE '[SMOKE OK] lc_verify_chain_segment — status=% rows=%', seg_status, seg_rows;
  END;


  -- ── 5. Hash encadenado de cobros ──────────────────────────────────────────
  -- El trigger tpv_cobros_hash_before también llama digest(). No es una función
  -- autónoma invocable, así que verificamos digest() directamente con el mismo
  -- search_path que usa el trigger (SET search_path = public, extensions, pg_catalog).

  result_text := encode(digest('smoke-cobro-payload', 'sha256'), 'hex');
  IF length(result_text) <> 64 THEN
    RAISE EXCEPTION '[SMOKE FAIL] digest() para cobros devolvió longitud inesperada';
  END IF;
  RAISE NOTICE '[SMOKE OK] digest() para cobros — hash = %', result_text;


  -- ── 6. get_waiter_badge_counts ────────────────────────────────────────────
  -- Alimenta los badges del WaiterBanner, la ruta más caliente del sistema.
  -- Devuelve un jsonb con seis claves fijas; si una desaparece o se renombra,
  -- el cliente lee undefined y pinta 0 SIN error visible — el camarero deja de
  -- ver comandas y nada falla de forma ruidosa. De ahí que se verifique la forma
  -- completa, no solo que la función sea invocable.

  DECLARE
    badge      JSONB;
    badge_keys TEXT[] := ARRAY['cocinaTotal','cocinaListos','cocinaRetenidos',
                               'bebidasTotal','pendientes','llamadas'];
    k          TEXT;
  BEGIN
    badge := public.get_waiter_badge_counts(dummy);

    IF badge IS NULL THEN
      RAISE EXCEPTION '[SMOKE FAIL] get_waiter_badge_counts devolvió NULL';
    END IF;

    FOREACH k IN ARRAY badge_keys LOOP
      IF NOT (badge ? k) THEN
        RAISE EXCEPTION '[SMOKE FAIL] get_waiter_badge_counts: falta la clave "%" — el badge quedaría a 0 en silencio. Payload: %', k, badge;
      END IF;
      IF jsonb_typeof(badge -> k) <> 'number' THEN
        RAISE EXCEPTION '[SMOKE FAIL] get_waiter_badge_counts: "%" no es número, es % ', k, jsonb_typeof(badge -> k);
      END IF;
      IF (badge ->> k)::numeric < 0 THEN
        RAISE EXCEPTION '[SMOKE FAIL] get_waiter_badge_counts: "%" negativo (%)', k, badge ->> k;
      END IF;
    END LOOP;

    -- Empresa inexistente: todo a cero. Si algo sale distinto de 0, el filtro de
    -- tenant no está aislando y se estarían contando comandas de otra empresa.
    IF (badge ->> 'cocinaTotal')::int <> 0 OR (badge ->> 'pendientes')::int <> 0
       OR (badge ->> 'bebidasTotal')::int <> 0 OR (badge ->> 'llamadas')::int <> 0 THEN
      RAISE EXCEPTION '[SMOKE FAIL] get_waiter_badge_counts: empresa inexistente devolvió conteos no nulos — fuga entre tenants: %', badge;
    END IF;

    RAISE NOTICE '[SMOKE OK] get_waiter_badge_counts — 6 claves numéricas, aislamiento de tenant OK';
  END;


  -- ── 7. Ninguna policy re-evalua auth.uid() por fila ───────────────────────
  -- `auth.uid()` suelta dentro de una policy se evalua UNA VEZ POR FILA. Envuelta
  -- en (SELECT ...) Postgres la promueve a InitPlan y la evalua una sola vez.
  --
  -- Este guard no esta aqui por las policies que ya existen —esas se corrigieron
  -- en 20260803000002— sino por `lc_create_next_partition()`, que CREA policies
  -- nuevas cada mes desde el cron. Si alguien edita ese generador y se deja la
  -- forma sin envolver, el defecto vuelve solo, en silencio y de forma acumulativa:
  -- una particion nueva con dos policies defectuosas cada mes.

  DECLARE
    r_pol   RECORD;
    n_malas INT := 0;
  BEGIN
    FOR r_pol IN
      SELECT tablename, policyname,
             regexp_replace(
               COALESCE(qual, '') || ' ' || COALESCE(with_check, ''),
               '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\)', '', 'g'
             ) AS resto
        FROM pg_policies
       WHERE schemaname = 'public'
    LOOP
      IF r_pol.resto ~ 'auth\.uid\(\)' THEN
        n_malas := n_malas + 1;
        RAISE WARNING '[SMOKE FAIL] policy "%" en % usa auth.uid() sin envolver en (SELECT ...)',
          r_pol.policyname, r_pol.tablename;
      END IF;
    END LOOP;

    IF n_malas > 0 THEN
      RAISE EXCEPTION '[SMOKE FAIL] % policy(s) re-evaluan auth.uid() por fila. Usar (SELECT auth.uid()). Si vienen de lc_create_next_partition(), corregir tambien el generador o volveran el mes que viene.', n_malas;
    END IF;

    RAISE NOTICE '[SMOKE OK] ninguna policy re-evalua auth.uid() por fila';
  END;


  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'TODOS LOS SMOKE TESTS PASARON (7/7)';
  RAISE NOTICE '════════════════════════════════════════';

END;
$$;
