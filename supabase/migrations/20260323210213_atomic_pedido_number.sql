-- Atomic order number generation to prevent race conditions when multiple
-- concurrent orders are placed for the same empresa. Uses a row-level lock
-- (FOR UPDATE) so only one transaction can read/increment at a time.

CREATE OR REPLACE FUNCTION get_next_pedido_number(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(numero_pedido), 0) + 1
  INTO v_next
  FROM pedidos
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  RETURN v_next;
END;
$$;
