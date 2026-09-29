-- Marca de envío del email de confirmación de pedido al cliente.
--
-- Hace de candado: el email se puede disparar desde varios caminos para el
-- mismo pedido (webhook de Redsys, vuelta del navegador a confirm-pedido,
-- reintentos idempotentes de POST /api/pedidos). Solo envía quien la reclama
-- con `UPDATE ... WHERE confirmacion_email_enviado_at IS NULL`.
--
-- Columna nula en una tabla existente: hereda RLS y GRANTs de `pedidos`. No
-- toca ningún dato fiscal (total/detalle), así que no afecta a la retención
-- del Art.66 LGT.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS confirmacion_email_enviado_at timestamptz;

COMMENT ON COLUMN public.pedidos.confirmacion_email_enviado_at IS
  'Cuándo se envió al cliente el email de confirmación del pedido. NULL = no enviado.';
