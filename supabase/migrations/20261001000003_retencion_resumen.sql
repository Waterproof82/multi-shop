-- Resumen de registros por empresa, apartado y ejercicio, para la cuenta atrás
-- de conservación (`src/lib/empresa/retencion.ts`): el superadmin la ve para
-- todas las empresas y cada admin para la suya.
--
-- Solo lectura y solo conteos: no devuelve ningún dato de los registros.
--
-- El ejercicio se calcula en hora de Madrid: un pedido del 1/1 a las 00:30 en
-- España es aún 31/12 en UTC, y caería en el ejercicio anterior.
--
-- Los pedidos marcados `es_prueba` (tests E2E) no cuentan, igual que en
-- `get_pedido_stats_ano`.

CREATE OR REPLACE FUNCTION public.retencion_resumen(p_empresa_id uuid DEFAULT NULL)
  RETURNS TABLE (empresa_id uuid, apartado text, ejercicio integer, registros bigint)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT p.empresa_id, 'pedidos', extract(year FROM p.created_at AT TIME ZONE 'Europe/Madrid')::int, count(*)
  FROM public.pedidos p
  WHERE NOT p.es_prueba AND (p_empresa_id IS NULL OR p.empresa_id = p_empresa_id)
  GROUP BY 1, 3
  UNION ALL
  SELECT c.empresa_id, 'cobros', extract(year FROM c.cobrado_at AT TIME ZONE 'Europe/Madrid')::int, count(*)
  FROM public.tpv_cobros c
  WHERE p_empresa_id IS NULL OR c.empresa_id = p_empresa_id
  GROUP BY 1, 3
  UNION ALL
  SELECT t.empresa_id, 'turnos', extract(year FROM t.apertura_at AT TIME ZONE 'Europe/Madrid')::int, count(*)
  FROM public.tpv_turnos t
  WHERE p_empresa_id IS NULL OR t.empresa_id = p_empresa_id
  GROUP BY 1, 3
  UNION ALL
  SELECT f.empresa_id, 'fichajes', extract(year FROM f.timestamp_evento AT TIME ZONE 'Europe/Madrid')::int, count(*)
  FROM public.lc_fichajes f
  WHERE p_empresa_id IS NULL OR f.empresa_id = p_empresa_id
  GROUP BY 1, 3;
$$;

-- Solo el backend. Sin estos REVOKE la función quedaría expuesta en
-- /rest/v1/rpc/retencion_resumen y con p_empresa_id NULL devolvería los
-- conteos de TODAS las empresas a cualquiera.
REVOKE EXECUTE ON FUNCTION public.retencion_resumen(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.retencion_resumen(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.retencion_resumen(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.retencion_resumen(uuid) TO service_role;
