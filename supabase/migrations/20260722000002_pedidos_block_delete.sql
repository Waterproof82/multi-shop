-- Block DELETE on pedidos (Art.66 LGT — retención fiscal mínima 5 años)
-- Mismo patrón que tpv_cobros y tpv_turnos.
-- Los pedidos son la fuente de datos de tpv_cobros; borrarlos rompería
-- la trazabilidad del audit trail fiscal aunque el cobro permanezca intacto.

CREATE OR REPLACE FUNCTION pedidos_block_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'pedidos: DELETE no permitido (Art.66 LGT — retención fiscal mínima 5 años)';
END;
$$;

CREATE TRIGGER pedidos_no_delete
  BEFORE DELETE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION pedidos_block_delete();
