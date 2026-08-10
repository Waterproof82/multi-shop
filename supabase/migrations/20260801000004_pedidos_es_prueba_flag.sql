-- Marca explícita de pedido de prueba, como base para poder purgarlos.
--
-- CONTEXTO
-- Los tests E2E insertan pedidos directamente vía PostgREST con service_role
-- (ver e2e/waiter-pendientes-kitchen-routing.spec.ts). Como el trigger
-- `pedidos_no_delete` bloquea todo DELETE, el teardown de los tests solo podía
-- moverlos a estado 'cancelado' — el propio comentario del test lo dice. Efecto:
-- las filas se acumulan indefinidamente en la tabla con retención fiscal,
-- contaminando los agregados del dashboard (a fecha de esta migración, 200
-- pedidos con items `__test_*`, importe 0, sin ningún cobro asociado).
--
-- POR QUÉ UN FLAG Y NO DETECTAR POR NOMBRE
-- Filtrar por `nombre LIKE '__test%'` sería frágil e inseguro: un plato real
-- podría llamarse así, y la condición para borrar un registro fiscal no puede
-- depender de una cadena de texto que introduce el usuario. El flag es
-- explícito, se fija en el INSERT y no se puede cambiar después.
--
-- POR QUÉ NO SE EXPONE EN LA API
-- `es_prueba` NO se añade a ningún DTO de Zod ni a ningún mapper de repositorio.
-- La única vía para ponerlo a true es el acceso directo con service_role, que es
-- lo que usan los tests. Si se expusiera al cliente, marcar un pedido como
-- prueba sería una forma de sacarlo de los totales fiscales — es decir, un
-- vector de ocultación de ingresos. No exponerlo es parte del control.

-- ── 1. Columna ───────────────────────────────────────────────────────────────
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pedidos.es_prueba IS
  'true solo para pedidos sintéticos de tests E2E. Se fija en el INSERT y es inmutable. '
  'Los pedidos con este flag quedan excluidos de los agregados fiscales y son los únicos '
  'que el trigger pedidos_block_delete permite borrar. Nunca exponer en la API pública.';

-- Índice parcial: la inmensa mayoría de filas son false, así que solo indexamos
-- las de prueba. Sirve tanto a la purga como al filtrado en los agregados.
CREATE INDEX IF NOT EXISTS idx_pedidos_es_prueba
  ON public.pedidos (empresa_id)
  WHERE es_prueba;

-- ── 2. Backfill de los pedidos de prueba ya existentes ───────────────────────
-- Criterios acumulativos y demostrables, no heurísticos sueltos:
--   a) contiene al menos un item con nombre `__test*`
--   b) importe cero — no representa ingreso alguno
--   c) no tiene NINGÚN cobro asociado, es decir jamás se emitió un documento
--      fiscal a partir de él; sin documento emitido no hay nada que conservar
-- Debe ejecutarse ANTES de crear el trigger de inmutabilidad del paso 3.
UPDATE public.pedidos p
SET es_prueba = true
WHERE p.total = 0
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.detalle_pedido) = 'array' THEN p.detalle_pedido ELSE '[]'::jsonb END
    ) AS i
    WHERE i ->> 'nombre' LIKE '\_\_test%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.tpv_cobros c
    WHERE c.sesion_id IS NOT DISTINCT FROM p.sesion_id
      AND p.sesion_id IS NOT NULL
  );

-- ── 3. Inmutabilidad del flag ────────────────────────────────────────────────
-- Este es el control que impide que la puerta de borrado se use contra registros
-- reales. Sin él, bastaría con hacer UPDATE es_prueba=true sobre un pedido
-- facturado y luego borrarlo, esquivando por completo el Art. 66 LGT.
-- Se bloquea el cambio en AMBOS sentidos: un pedido nace de prueba o no lo es.
CREATE OR REPLACE FUNCTION public.pedidos_es_prueba_inmutable()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NEW.es_prueba IS DISTINCT FROM OLD.es_prueba THEN
    RAISE EXCEPTION
      'pedidos.es_prueba es inmutable: se fija en el INSERT y no puede cambiarse (Art.66 LGT)';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pedidos_es_prueba_inmutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pedidos_es_prueba_inmutable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pedidos_es_prueba_inmutable() FROM authenticated;

DROP TRIGGER IF EXISTS pedidos_es_prueba_inmutable ON public.pedidos;
CREATE TRIGGER pedidos_es_prueba_inmutable
  BEFORE UPDATE OF es_prueba ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.pedidos_es_prueba_inmutable();
