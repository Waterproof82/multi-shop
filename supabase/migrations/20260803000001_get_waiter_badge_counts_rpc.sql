-- Performance: colapsar en una sola consulta los contadores del WaiterBanner.
--
-- PROBLEMA
-- `GET /api/waiter/orders/counts` es la ruta más caliente del sistema: el
-- WaiterBanner la re-invoca en CADA evento de Realtime, y el banner se renderiza
-- en TODAS las páginas. Para devolver seis enteros hacía hasta diez roundtrips:
--
--   countKitchenBarOrders()      -> 5 consultas encadenadas
--     1. pedidos activos + JOIN mesas  (trae el jsonb `detalle_pedido` entero)
--     2. pedido_item_estados IN (ids del paso 1)
--     3. mesa_sesiones abiertas
--     4. pedidos de esas sesiones      (otra vez `detalle_pedido` entero)
--     5. pedido_item_estados IN (ids del paso 4)
--   findPendientesValidacion()   -> 5 consultas encadenadas más
--
-- Y el caso de `findPendientesValidacion` era el más caro de todos: construía el
-- árbol completo mesa -> pedidos -> ítems, con joins a `mesas` y overrides de
-- pase, para que la ruta hiciera acto seguido un `.reduce()` y se quedara solo
-- con la longitud. Se transportaba el menú entero de un servicio para contar.
--
-- Encadenadas, no en paralelo: cada paso necesita los ids del anterior. En una
-- tablet del comedor por 4G eso son ~10 RTT apilados por cada evento de Realtime.
--
-- SOLUCIÓN
-- Agregar en la base y devolver solo los seis números. Payload constante (~120 B)
-- y un único RTT, sea cual sea el volumen del servicio.
--
-- EQUIVALENCIA CON LA LÓGICA JS QUE SUSTITUYE
--   fetchAllComidaItems + tallyCocinaItems -> CTE `comida`
--     · mismo filtro de estados excluidos. `p.estado NOT IN (...)` descarta
--       también los NULL, igual que el `.not('estado','in',...)` de PostgREST.
--     · `mesas!inner` -> JOIN (mesa_id es nullable, así que filtra de verdad).
--     · ítems con `from_validation` = true se excluyen por completo: están de
--       vuelta en la cola de pendientes, no son trabajo de cocina.
--     · sin fila en pedido_item_estados -> el estado por defecto sale del pedido
--       ('retenido' si el pedido lo está, si no 'pendiente').
--   countBebidasTotal -> CTE `bebida`
--     · NO se une a `mesas` ni filtra por empresa en `pedidos`: el aislamiento
--       de tenant entra por `mesa_sesiones.empresa_id`, tal cual el original.
--     · cuenta el ítem salvo que su estado sea 'servido' o 'cancelado'.
--   findPendientesValidacion (solo el conteo) -> `pend_validacion` + `pend_retenidos`
--     · pend_validacion: ítems de pedidos en 'pendiente_validacion', restando
--       los cancelados (applyCancelados).
--     · pend_retenidos: ítems retenidos durante la validación que volvieron a la
--       cola (addValidatedRetenidos). La condición `item_idx` contra ORDINALITY
--       replica el `.filter(item => retenidoIndices.has(item.idx))`, que descarta
--       índices fuera del rango de `detalle_pedido`.
--
-- Los índices se numeran desde 0 en JS y desde 1 en WITH ORDINALITY: de ahí el
-- `it.ord - 1`.
--
-- REALTIME
-- Esta función es de solo lectura y no toca canales, publicaciones ni triggers.
-- Cambia únicamente CÓMO se cuenta, no QUÉ dispara el recuento.

CREATE OR REPLACE FUNCTION public.get_waiter_badge_counts(p_empresa_id uuid)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  WITH comida AS (
    SELECT
      CASE
        WHEN e.estado IS NOT NULL     THEN e.estado
        WHEN p.estado = 'retenido'    THEN 'retenido'
        ELSE 'pendiente'
      END AS estado
    FROM public.pedidos p
    JOIN public.mesas m ON m.id = p.mesa_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.detalle_pedido) = 'array' THEN p.detalle_pedido ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS it(item, ord)
    LEFT JOIN public.pedido_item_estados e
           ON e.pedido_id = p.id AND e.item_idx = (it.ord - 1)::int
    WHERE p.empresa_id = p_empresa_id
      AND p.estado NOT IN ('servido', 'cerrado', 'cancelado', 'pendiente_validacion')
      AND it.item ->> 'tipo_producto' = 'comida'
      AND (e.pedido_id IS NULL OR NOT e.from_validation)
  ),
  bebida AS (
    SELECT 1 AS x
    FROM public.mesa_sesiones s
    JOIN public.pedidos p ON p.sesion_id = s.id AND p.estado = 'pendiente'
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.detalle_pedido) = 'array' THEN p.detalle_pedido ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS it(item, ord)
    LEFT JOIN public.pedido_item_estados e
           ON e.pedido_id = p.id AND e.item_idx = (it.ord - 1)::int
    WHERE s.empresa_id = p_empresa_id
      AND s.cerrada_at IS NULL
      AND it.item ->> 'tipo_producto' = 'bebida'
      AND (e.pedido_id IS NULL OR NOT e.from_validation)
      AND (e.estado IS NULL OR e.estado NOT IN ('servido', 'cancelado'))
  ),
  pend_validacion AS (
    SELECT 1 AS x
    FROM public.pedidos p
    JOIN public.mesas m ON m.id = p.mesa_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.detalle_pedido) = 'array' THEN p.detalle_pedido ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS it(item, ord)
    LEFT JOIN public.pedido_item_estados c
           ON c.pedido_id = p.id AND c.item_idx = (it.ord - 1)::int
          AND c.empresa_id = p_empresa_id
          AND c.estado = 'cancelado'
    WHERE p.empresa_id = p_empresa_id
      AND p.estado = 'pendiente_validacion'
      AND c.pedido_id IS NULL
  ),
  pend_retenidos AS (
    SELECT 1 AS x
    FROM public.pedido_item_estados r
    JOIN public.pedidos p ON p.id = r.pedido_id
    JOIN public.mesas m   ON m.id = p.mesa_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.detalle_pedido) = 'array' THEN p.detalle_pedido ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS it(item, ord)
    WHERE r.empresa_id = p_empresa_id
      AND r.estado = 'retenido'
      AND r.from_validation
      AND p.empresa_id = p_empresa_id
      AND p.estado IN ('pendiente', 'anotado')
      AND (it.ord - 1)::int = r.item_idx
  )
  SELECT jsonb_build_object(
    'cocinaTotal',     (SELECT COUNT(*) FROM comida WHERE estado IN ('pendiente', 'en_preparacion')),
    'cocinaListos',    (SELECT COUNT(*) FROM comida WHERE estado = 'listo'),
    'cocinaRetenidos', (SELECT COUNT(*) FROM comida WHERE estado = 'retenido'),
    'bebidasTotal',    (SELECT COUNT(*) FROM bebida),
    'pendientes',      (SELECT COUNT(*) FROM pend_validacion) + (SELECT COUNT(*) FROM pend_retenidos),
    'llamadas',        (SELECT COUNT(*) FROM public.mesa_sesiones
                         WHERE empresa_id = p_empresa_id
                           AND llamada_activa
                           AND cerrada_at IS NULL)
  );
$$;

-- Solo la capa servidor la invoca (la ruta usa getSupabaseClient(), service_role).
-- Sin estos REVOKE quedaría expuesta en /rest/v1/rpc/get_waiter_badge_counts para
-- cualquier cliente anónimo, filtrando la carga operativa de cualquier empresa.
REVOKE EXECUTE ON FUNCTION public.get_waiter_badge_counts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_waiter_badge_counts(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_waiter_badge_counts(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_waiter_badge_counts(uuid) TO service_role;
