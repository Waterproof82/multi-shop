-- Migration: add tipo_producto to productos, telegram_bebidas_chat_id to empresas

-- 1. tipo_producto: distinguishes food from drinks per product
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS tipo_producto TEXT NOT NULL DEFAULT 'comida'
  CHECK (tipo_producto IN ('comida', 'bebida'));

-- 2. telegram_bebidas_chat_id: optional Telegram group for the bar (drinks station)
--    When set, drinks go to this group and food goes to telegram_mesa_chat_id (kitchen)
--    When null, all items go to the single telegram_mesa_chat_id (existing behaviour)
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS telegram_bebidas_chat_id TEXT NULL;
