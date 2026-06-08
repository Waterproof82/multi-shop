-- Add telegram_bebidas_message_id to pedidos
-- When telegram_bebidas_chat_id is set on empresa, bebidas orders are sent to a separate bar group.
-- This stores the message ID for that group so the waiter can delete/edit it later.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS telegram_bebidas_message_id TEXT NULL;
