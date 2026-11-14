-- store-people-configurator: escalado de receta y precio por personas (tienda).
--
-- Qué añade:
--   * receta_items.regla_personas — cómo escala esta fila de receta con el
--     número de personas del pedido, SIEMPRE como multiplicador RELATIVO
--     sobre la cantidad base:
--       'por_persona' → base × N (una por persona; la ración base-2 del Plus
--                       escala 2×N con esta misma regla)
--       'pack:C'      → base × ceil(N / C) (un envase cubre C personas)
--       'compartido'  → base × 1 (uno para todo el grupo)
--       NULL          → comportamiento legado (×1, sin escalado)
--     NOTA: no existe 'por_persona:C'. Para "C unidades por persona" la base
--     de la fila ES C y la regla es 'por_persona' — así la cantidad base de
--     la receta y la de la tabla pública nunca pueden divergir.
--   * receta_items.tabla_fila — índice 0-based de la fila de tabla_info del
--     producto que esta fila de receta representa (enlaza composición
--     pública y receta de stock, que antes no tenían relación).
--   * productos.personas_min / personas_max / personas_paso_cents — límites
--     del configurador. Los tres NOT NULL (juntos) = producto con
--     configurador (personas que cubre el kit base, tope del contador y
--     precio por persona extra en céntimos). Cualquiera NULL = sin
--     configurador. CHECK exige que aparezcan o desaparezcan juntos.
--   * factor_regla() — factor de escalado de una regla para N personas.
--   * deducir_stock_on_servido v2 — filas con regla descuentan
--     cantidad_necesaria × factor(regla, personas) × cantidad del ítem;
--     filas con regla NULL siguen descontando exactamente ×1 por fila como
--     antes (limitación preexistente con cantidad > 1 documentada en
--     docs/PENDIENTES.md como decisión separada — los otros tenants no
--     cambian). El binding del trigger (stock_deduccion_trigger) no cambia:
--     CREATE OR REPLACE solo sustituye el cuerpo de la función.
--
-- Sin GRANTs nuevos: `personas_*` en productos NO se concede a anon (el
-- catálogo público no las lee; el PDP y el path de pedido van por
-- service_role). Vigilado por tests/compliance/productos-anon-grant-sync.

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — cuerpo ANTERIOR de deducir_stock_on_servido (20260706000003) y
-- drop de columnas. Ejecutar el CREATE OR REPLACE de abajo con este cuerpo
-- para volver al estado previo:
--
-- CREATE OR REPLACE FUNCTION public.deducir_stock_on_servido()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   v_producto_id    UUID;
--   v_empresa_id     UUID;
--   v_receta         RECORD;
--   v_nueva_cantidad NUMERIC(10,3);
--   v_tiene_receta   BOOLEAN := FALSE;
-- BEGIN
--   -- Guard: only fire when estado = 'servido'
--   IF NEW.estado <> 'servido' THEN
--     RETURN NEW;
--   END IF;
--
--   -- Resolve empresa_id and producto_id from pedidos.detalle_pedido JSONB
--   SELECT
--     p.empresa_id,
--     (p.detalle_pedido->NEW.item_idx->>'producto_id')::uuid
--   INTO v_empresa_id, v_producto_id
--   FROM pedidos p
--   WHERE p.id = NEW.pedido_id;
--
--   -- item_idx out of bounds or null product — skip silently
--   IF v_producto_id IS NULL THEN
--     RETURN NEW;
--   END IF;
--
--   -- Iterate over recipe items for this product
--   FOR v_receta IN
--     SELECT ri.ingrediente_id, ri.cantidad_necesaria
--     FROM receta_items ri
--     WHERE ri.producto_id = v_producto_id
--   LOOP
--     v_tiene_receta := TRUE;
--
--     -- Atomic decrement (DB CHECK prevents negative)
--     UPDATE ingredientes
--     SET cantidad_actual = cantidad_actual - v_receta.cantidad_necesaria
--     WHERE id = v_receta.ingrediente_id
--     RETURNING cantidad_actual INTO v_nueva_cantidad;
--
--     -- Audit row (turno_id is NULL for automatic deductions — turno is unknown at serve time)
--     INSERT INTO movimientos_stock (empresa_id, ingrediente_id, tipo, cantidad, referencia_id, turno_id)
--     VALUES (v_empresa_id, v_receta.ingrediente_id, 'deduccion', v_receta.cantidad_necesaria, NEW.pedido_id, NULL);
--
--     -- Auto-disable products if any ingredient drops below threshold
--     IF v_nueva_cantidad < (SELECT umbral_alerta FROM ingredientes WHERE id = v_receta.ingrediente_id) THEN
--       UPDATE productos
--       SET activo = false
--       WHERE id IN (
--         SELECT ri2.producto_id FROM receta_items ri2
--         WHERE ri2.ingrediente_id = v_receta.ingrediente_id
--       );
--     END IF;
--   END LOOP;
--
--   -- If no recipe is configured, write a sin_receta warning row for traceability.
--   -- ingrediente_id is NULL because there is no specific ingredient to reference.
--   IF NOT v_tiene_receta THEN
--     INSERT INTO movimientos_stock (empresa_id, ingrediente_id, tipo, cantidad, referencia_id, turno_id)
--     VALUES (v_empresa_id, NULL, 'sin_receta', 0, NEW.pedido_id, NULL);
--   END IF;
--
--   RETURN NEW;
-- END;
-- $$;
--
-- ALTER TABLE public.receta_items DROP CONSTRAINT IF EXISTS receta_items_regla_personas_check;
-- ALTER TABLE public.receta_items DROP COLUMN IF EXISTS regla_personas;
-- ALTER TABLE public.receta_items DROP COLUMN IF EXISTS tabla_fila;
-- ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_personas_config_check;
-- ALTER TABLE public.productos DROP COLUMN IF EXISTS personas_min;
-- ALTER TABLE public.productos DROP COLUMN IF EXISTS personas_max;
-- ALTER TABLE public.productos DROP COLUMN IF EXISTS personas_paso_cents;
-- DROP FUNCTION IF EXISTS public.factor_regla(TEXT, INT);
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.receta_items
  ADD COLUMN regla_personas TEXT,
  ADD COLUMN tabla_fila INTEGER;

ALTER TABLE public.receta_items
  ADD CONSTRAINT receta_items_regla_personas_check
  CHECK (
    regla_personas IS NULL
    OR regla_personas IN ('por_persona', 'compartido')
    OR regla_personas ~ '^pack:[0-9]+$'
  );

ALTER TABLE public.productos
  ADD COLUMN personas_min INT,
  ADD COLUMN personas_max INT,
  ADD COLUMN personas_paso_cents INT;

ALTER TABLE public.productos
  ADD CONSTRAINT productos_personas_config_check
  CHECK (
    (personas_min IS NULL AND personas_max IS NULL AND personas_paso_cents IS NULL)
    OR (
      personas_min IS NOT NULL
      AND personas_max IS NOT NULL
      AND personas_paso_cents IS NOT NULL
      AND personas_min >= 1
      AND personas_max >= personas_min
      AND personas_paso_cents > 0
    )
  );

-- Factor de escalado de una fila de receta para N personas. Espejo exacto de
-- factorPeople() en src/lib/catalogo/escala-people.ts (el drift entre SQL y
-- browser lo vigila la suite de compliance, no hay forma única de compartirlo).
CREATE OR REPLACE FUNCTION public.factor_regla(p_regla TEXT, p_personas INT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_m TEXT[];
BEGIN
  IF p_regla IS NULL OR p_personas IS NULL OR p_personas < 1 THEN
    RETURN 1;
  END IF;
  IF p_regla = 'por_persona' THEN
    RETURN p_personas;
  END IF;
  IF p_regla = 'compartido' THEN
    RETURN 1;
  END IF;
  v_m := regexp_match(p_regla, '^pack:([0-9]+)$');
  IF v_m IS NULL OR v_m[1]::int < 1 THEN
    RETURN 1;
  END IF;
  RETURN ceil(p_personas::numeric / v_m[1]::int);
END;
$$;

CREATE OR REPLACE FUNCTION public.deducir_stock_on_servido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_producto_id    UUID;
  v_empresa_id     UUID;
  v_receta         RECORD;
  v_nueva_cantidad NUMERIC(10,3);
  v_tiene_receta   BOOLEAN := FALSE;
  v_personas       INT;
  v_item_cantidad  INT;
  v_deduccion      NUMERIC;
BEGIN
  -- Guard: only fire when estado = 'servido'
  IF NEW.estado <> 'servido' THEN
    RETURN NEW;
  END IF;

  -- Resolve empresa_id, producto_id, personas y cantidad del ítem desde el
  -- jsonb. personas: lo persiste el pedido (PedidoUseCase, ya clamped);
  -- fallback = personas_min del producto (configurador base) y, en última
  -- instancia, 1. El JOIN con productos es por el producto del ÍTEM, igual
  -- que la receta de abajo.
  SELECT
    p.empresa_id,
    (p.detalle_pedido->NEW.item_idx->>'producto_id')::uuid,
    COALESCE(
      (p.detalle_pedido->NEW.item_idx->>'personas')::int,
      prod.personas_min,
      1
    ),
    COALESCE((p.detalle_pedido->NEW.item_idx->>'cantidad')::int, 1)
  INTO
    v_empresa_id, v_producto_id, v_personas, v_item_cantidad
  FROM pedidos p
  LEFT JOIN productos prod
    ON prod.id = (p.detalle_pedido->NEW.item_idx->>'producto_id')::uuid
  WHERE p.id = NEW.pedido_id;

  -- item_idx out of bounds or null product — skip silently
  IF v_producto_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Iterate over recipe items for this product
  FOR v_receta IN
    SELECT ri.ingrediente_id, ri.cantidad_necesaria, ri.regla_personas
    FROM receta_items ri
    WHERE ri.producto_id = v_producto_id
  LOOP
    v_tiene_receta := TRUE;

    -- Filas con regla escalan por personas y multiplican por la cantidad del
    -- ítem. Filas con regla NULL conservan el comportamiento legado: ×1 por
    -- fila, ignorando la cantidad del ítem (limitación preexistente,
    -- docs/PENDIENTES.md).
    v_deduccion := v_receta.cantidad_necesaria
      * public.factor_regla(v_receta.regla_personas, v_personas)
      * (CASE WHEN v_receta.regla_personas IS NULL THEN 1 ELSE v_item_cantidad END);

    -- Atomic decrement (DB CHECK prevents negative)
    UPDATE ingredientes
    SET cantidad_actual = cantidad_actual - v_deduccion
    WHERE id = v_receta.ingrediente_id
    RETURNING cantidad_actual INTO v_nueva_cantidad;

    -- Audit row (turno_id is NULL for automatic deductions — turno is unknown at serve time)
    INSERT INTO movimientos_stock (empresa_id, ingrediente_id, tipo, cantidad, referencia_id, turno_id)
    VALUES (v_empresa_id, v_receta.ingrediente_id, 'deduccion', v_deduccion, NEW.pedido_id, NULL);

    -- Auto-disable products if any ingredient drops below threshold
    IF v_nueva_cantidad < (SELECT umbral_alerta FROM ingredientes WHERE id = v_receta.ingrediente_id) THEN
      UPDATE productos
      SET activo = false
      WHERE id IN (
        SELECT ri2.producto_id FROM receta_items ri2
        WHERE ri2.ingrediente_id = v_receta.ingrediente_id
      );
    END IF;
  END LOOP;

  -- If no recipe is configured, write a sin_receta warning row for traceability.
  -- ingrediente_id is NULL because there is no specific ingredient to reference.
  IF NOT v_tiene_receta THEN
    INSERT INTO movimientos_stock (empresa_id, ingrediente_id, tipo, cantidad, referencia_id, turno_id)
    VALUES (v_empresa_id, NULL, 'sin_receta', 0, NEW.pedido_id, NULL);
  END IF;

  RETURN NEW;
END;
$$;
