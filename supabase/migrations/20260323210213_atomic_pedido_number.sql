-- Atomic order number generation to prevent race conditions when multiple
-- concurrent orders are placed for the same empresa. Uses a row-level lock
-- (FOR UPDATE) so only one transaction can read/increment at a time.

-- Fix: FOR UPDATE cannot be used with aggregate functions (MAX).
-- Instead, lock the empresa row as a per-tenant mutex so concurrent
-- calls are serialized, then safely compute MAX(numero_pedido).
CREATE OR REPLACE FUNCTION get_next_pedido_number(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Lock the empresa row to serialize concurrent order number generation
  -- for the same tenant. This prevents two simultaneous orders from
  -- receiving the same numero_pedido.
  PERFORM id FROM empresas WHERE id = p_empresa_id FOR UPDATE;

  SELECT COALESCE(MAX(numero_pedido), 0) + 1
  INTO v_next
  FROM pedidos
  WHERE empresa_id = p_empresa_id;

  RETURN v_next;
END;
$$;
