-- Número de seguimiento del transportista para pedidos de tienda con envío a
-- domicilio, y marca de cuándo se avisó al cliente por email.
--
-- Columnas nulas en una tabla existente: heredan RLS y GRANTs de `pedidos`.
-- No tocan ningún dato fiscal (total/detalle), así que no afectan a la cadena
-- de retención del Art.66 LGT.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero_seguimiento text
    CHECK (numero_seguimiento IS NULL OR char_length(numero_seguimiento) BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS seguimiento_email_enviado_at timestamptz;

COMMENT ON COLUMN public.pedidos.numero_seguimiento IS
  'Número de seguimiento del transportista. Solo pedidos con modalidad_entrega_tipo = domicilio.';
COMMENT ON COLUMN public.pedidos.seguimiento_email_enviado_at IS
  'Último envío del email de seguimiento al cliente.';
