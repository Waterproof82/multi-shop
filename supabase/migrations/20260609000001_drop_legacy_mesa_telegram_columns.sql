-- Drop legacy mesa Telegram columns — replaced by in-app kitchen/bar flow.
-- The old system used separate kitchen/bar Telegram chats for mesa orders.
-- Those chats and their message IDs are no longer written to; safe to drop.

ALTER TABLE public.pedidos
  DROP COLUMN IF EXISTS telegram_bebidas_message_id,
  DROP COLUMN IF EXISTS telegram_preparado_alert_message_id;

ALTER TABLE public.empresas
  DROP COLUMN IF EXISTS telegram_bebidas_chat_id,
  DROP COLUMN IF EXISTS telegram_mesa_chat_id;
