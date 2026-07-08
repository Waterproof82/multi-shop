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
BEGIN
  -- Guard: only fire when estado = 'servido'
  IF NEW.estado <> 'servido' THEN
    RETURN NEW;
  END IF;

  -- Resolve empresa_id and producto_id from pedidos.detalle_pedido JSONB
  SELECT
    p.empresa_id,
    (p.detalle_pedido->NEW.item_idx->>'producto_id')::uuid
  INTO v_empresa_id, v_producto_id
  FROM pedidos p
  WHERE p.id = NEW.pedido_id;

  -- item_idx out of bounds or null product — skip silently
  IF v_producto_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Iterate over recipe items for this product
  FOR v_receta IN
    SELECT ri.ingrediente_id, ri.cantidad_necesaria
    FROM receta_items ri
    WHERE ri.producto_id = v_producto_id
  LOOP
    v_tiene_receta := TRUE;

    -- Atomic decrement (DB CHECK prevents negative)
    UPDATE ingredientes
    SET cantidad_actual = cantidad_actual - v_receta.cantidad_necesaria
    WHERE id = v_receta.ingrediente_id
    RETURNING cantidad_actual INTO v_nueva_cantidad;

    -- Audit row (turno_id is NULL for automatic deductions — turno is unknown at serve time)
    INSERT INTO movimientos_stock (empresa_id, ingrediente_id, tipo, cantidad, referencia_id, turno_id)
    VALUES (v_empresa_id, v_receta.ingrediente_id, 'deduccion', v_receta.cantidad_necesaria, NEW.pedido_id, NULL);

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

-- Bind trigger: INSERT OR UPDATE — upsertItemEstado does UPDATE on existing rows
-- Guard inside function: only fires when transitioning TO 'servido' (idempotent)
CREATE TRIGGER stock_deduccion_trigger
  AFTER INSERT OR UPDATE ON public.pedido_item_estados
  FOR EACH ROW
  EXECUTE FUNCTION public.deducir_stock_on_servido();

-- RPC for atomic quantity update (used by application layer for manual adjustments and mermas)
-- Returns the updated ingrediente row.
CREATE OR REPLACE FUNCTION public.stock_update_cantidad(
  p_ingrediente_id UUID,
  p_delta          NUMERIC
)
RETURNS SETOF public.ingredientes
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ingredientes
  SET cantidad_actual = cantidad_actual + p_delta
  WHERE id = p_ingrediente_id
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION public.stock_update_cantidad(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.stock_update_cantidad(UUID, NUMERIC) TO authenticated;
