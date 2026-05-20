import { Pedido, PedidoItem } from '@/core/domain/entities/types';
import { Result, AppError } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const sanitizeForMarkdown = (text: string | number | null | undefined): string => {
  const textAsString = String(text || '');
  return textAsString.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
};

const buildOrderMessage = (pedido: Pedido): string => {
  const { clientes: cliente, detalle_pedido: items, total, numero_pedido } = pedido;
  return [
    `*Nuevo Pedido: \\#${numero_pedido}*`,
    `*Cliente:* ${sanitizeForMarkdown(cliente?.nombre)}`,
    `*Teléfono:* ${sanitizeForMarkdown(cliente?.telefono)}`,
    '\\-\\-\\-',
    '*Items:*',
    ...items.map(
      (item: PedidoItem) =>
        `\\- ${item.cantidad}x ${sanitizeForMarkdown(item.nombre)} \\(${sanitizeForMarkdown(item.precio.toFixed(2))} €\\)`
    ),
    '\\-\\-\\-',
    `*Total:* ${sanitizeForMarkdown(total.toFixed(2))} €`,
  ].join('\n');
};

/** Send plain text notification (used by tienda mode) */
export const sendTelegramNotification = async (
  pedido: Pedido,
  chatId: string
): Promise<Result<void, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'TELEGRAM_BOT_TOKEN is not set.', module: 'infrastructure' },
    };
  }

  const message = buildOrderMessage(pedido);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'MarkdownV2' }),
      }
    );

    if (!response.ok) {
      const responseBody = await response.json().catch(() => response.text());
      const error = await logger.logAndReturnError(
        'TELEGRAM_API_ERROR',
        `Telegram API Error: ${response.status}`,
        'infrastructure',
        'sendTelegramNotification',
        { details: { status: response.status, body: responseBody } }
      );
      return { success: false, error };
    }

    return { success: true, data: undefined };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramNotification');
    return { success: false, error: appError };
  }
};

/** Send notification with inline time-selector buttons (used by restaurante mode) */
export const sendTelegramWithInlineButtons = async (
  pedido: Pedido,
  chatId: string
): Promise<Result<void, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'TELEGRAM_BOT_TOKEN is not set.', module: 'infrastructure' },
    };
  }

  const message = [
    buildOrderMessage(pedido),
    '',
    '⏱ *Selecciona tiempo estimado de preparación:*',
  ].join('\n');

  const inlineKeyboard = [
    [
      { text: '10 min', callback_data: `order:${pedido.id}:10` },
      { text: '15 min', callback_data: `order:${pedido.id}:15` },
    ],
    [
      { text: '20 min', callback_data: `order:${pedido.id}:20` },
      { text: '30 min', callback_data: `order:${pedido.id}:30` },
    ],
  ];

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'MarkdownV2',
          reply_markup: { inline_keyboard: inlineKeyboard },
        }),
      }
    );

    if (!response.ok) {
      const responseBody = await response.json().catch(() => response.text());
      const error = await logger.logAndReturnError(
        'TELEGRAM_API_ERROR',
        `Telegram API Error (inline): ${response.status}`,
        'infrastructure',
        'sendTelegramWithInlineButtons',
        { details: { status: response.status, body: responseBody } }
      );
      return { success: false, error };
    }

    return { success: true, data: undefined };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramWithInlineButtons');
    return { success: false, error: appError };
  }
};

/** Acknowledge a Telegram callback_query */
export const answerCallbackQuery = async (
  callbackQueryId: string,
  text: string
): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      }
    );
  } catch {
    // Best-effort — Telegram requires a 200 response regardless
  }
};
