-- Recogida en tienda pasa a ser implícita y no configurable — ver
-- docs/superpowers/specs/2026-09-15-recogida-implicita-sin-toggle-design.md

-- Las filas tipo='recogida' quedan huérfanas: TiendaFulfillmentSelector ya
-- no las lee (recogida es un ítem fijo en el código), y PedidoUseCase ya
-- no necesita un modalidad_entrega_id para persistir 'recogida'.
DELETE FROM public.modalidades_entrega WHERE tipo = 'recogida';

-- El único toggle que queda es envio_domicilio_habilitado.
ALTER TABLE public.empresas DROP COLUMN recogida_tienda_habilitada;
