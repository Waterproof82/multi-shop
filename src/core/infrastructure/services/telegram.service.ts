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
  const lines = [
    `*Nuevo Pedido: \\#${numero_pedido}*`,
    `*Cliente:* ${sanitizeForMarkdown(cliente?.nombre)}`,
    `*Teléfono:* [\\+${cliente?.telefono ?? ''}](tel:+${cliente?.telefono ?? ''})`,
  ];
  if (cliente?.email) {
    lines.push(`*Email:* ${sanitizeForMarkdown(cliente.email)}`);
  }
  lines.push(
    '\\-\\-\\-',
    '*Items:*',
    ...items.map(
      (item: PedidoItem) =>
        `\\- ${item.cantidad}x ${sanitizeForMarkdown(item.nombre)} \\(${sanitizeForMarkdown(item.precio.toFixed(2))} €\\)`
    ),
    '\\-\\-\\-',
    `*Total:* ${sanitizeForMarkdown(total.toFixed(2))} €`,
  );
  return lines.join('\n');
};

/** Send notification with inline time-selector buttons (used by restaurante mode) */
export const sendTelegramWithInlineButtons = async (
  pedido: Pedido,
  chatId: string
): Promise<Result<{ messageId: number }, AppError>> => {
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

    const json = await response.json() as { ok: boolean; result: { message_id: number } };
    return { success: true, data: { messageId: json.result.message_id } };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramWithInlineButtons');
    return { success: false, error: appError };
  }
};

/** Send notification with quick-reply buttons (used by tienda mode and non-pedidos restaurante) */
export const sendTelegramWithQuickReplies = async (
  pedido: Pedido,
  chatId: string
): Promise<Result<{ messageId: number }, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'TELEGRAM_BOT_TOKEN is not set.', module: 'infrastructure' },
    };
  }

  const message = buildOrderMessage(pedido);

  const inlineKeyboard = [
    [{ text: '💬 Te contestaremos lo más pronto posible', callback_data: `quick_reply:${pedido.id}:soon` }],
    [{ text: '📞 Te llamamos ahora en cuanto tengamos un momento', callback_data: `quick_reply:${pedido.id}:call` }],
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
        `Telegram API Error (quick-reply): ${response.status}`,
        'infrastructure',
        'sendTelegramWithQuickReplies',
        { details: { status: response.status, body: responseBody } }
      );
      return { success: false, error };
    }

    const json = await response.json() as { ok: boolean; result: { message_id: number } };
    return { success: true, data: { messageId: json.result.message_id } };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramWithQuickReplies');
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

/** Edit an existing Telegram message — used to mark orders as processed */
export const editMessageText = async (
  chatId: string,
  messageId: number,
  text: string,
  inlineKeyboard: { text: string; callback_data: string }[][] = []
): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: inlineKeyboard } }),
      }
    );
  } catch {
    // Best-effort
  }
};

/** Edit only the inline keyboard of an existing message — text stays intact */
export const editMessageReplyMarkup = async (
  chatId: string,
  messageId: number,
  inlineKeyboard: { text: string; callback_data: string }[][] = []
): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: inlineKeyboard } }),
      }
    );
  } catch {
    // Best-effort
  }
};

/** Build a mesa order message: order number, table, and products only — no prices */
const buildMesaOrderMessage = (
  pedidoId: string,
  numeroPedido: number,
  items: { nombre: string; cantidad: number }[],
  mesaNumero: number,
  mesaNombre: string | null
): string => {
  const tableLabel = mesaNombre ? `${sanitizeForMarkdown(mesaNombre)} \\(Mesa ${mesaNumero}\\)` : `Mesa ${mesaNumero}`;
  const lines = [
    `*Pedido \\#${numeroPedido} — ${tableLabel}*`,
    '',
    ...items.map(item => `\\- ${item.cantidad}x ${sanitizeForMarkdown(item.nombre)}`),
  ];
  void pedidoId;
  return lines.join('\n');
};

/**
 * Send mesa order notification with Anotado/Preparado buttons (3-state flow).
 * Items are filtered by tipo before calling — pass only the relevant subset.
 */
export const sendTelegramForMesa = async (
  pedidoId: string,
  numeroPedido: number,
  items: { nombre: string; cantidad: number }[],
  mesaNumero: number,
  mesaNombre: string | null,
  chatId: string
): Promise<Result<{ messageId: number }, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'TELEGRAM_BOT_TOKEN is not set.', module: 'infrastructure' },
    };
  }

  const message = buildMesaOrderMessage(pedidoId, numeroPedido, items, mesaNumero, mesaNombre);

  const inlineKeyboard = [
    [
      { text: '✅ Anotado', callback_data: `anotado:${pedidoId}` },
      { text: '🍳 Preparado', callback_data: `preparado:${pedidoId}` },
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
        `Telegram API Error (mesa): ${response.status}`,
        'infrastructure',
        'sendTelegramForMesa',
        { details: { status: response.status, body: responseBody } }
      );
      return { success: false, error };
    }

    const json = await response.json() as { ok: boolean; result: { message_id: number } };
    return { success: true, data: { messageId: json.result.message_id } };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramForMesa');
    return { success: false, error: appError };
  }
};

/**
 * Send a drinks-only informational message to the bar group (no estado buttons needed).
 * When comida reaches "preparado", a follow-up alert is sent via sendTelegramPreparadoAlert.
 */
export const sendTelegramBebidasInfo = async (
  numeroPedido: number,
  items: { nombre: string; cantidad: number }[],
  mesaNumero: number,
  mesaNombre: string | null,
  chatId: string
): Promise<Result<{ messageId: number }, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      success: false,
      error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'TELEGRAM_BOT_TOKEN is not set.', module: 'infrastructure' },
    };
  }

  const tableLabel = mesaNombre ? `${sanitizeForMarkdown(mesaNombre)} \\(Mesa ${mesaNumero}\\)` : `Mesa ${mesaNumero}`;
  const lines = [
    `🥤 *Bebidas \\#${numeroPedido} — ${tableLabel}*`,
    '',
    ...items.map(item => `\\- ${item.cantidad}x ${sanitizeForMarkdown(item.nombre)}`),
  ];
  const message = lines.join('\n');

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
        }),
      }
    );

    if (!response.ok) {
      const responseBody = await response.json().catch(() => response.text());
      const error = await logger.logAndReturnError(
        'TELEGRAM_API_ERROR',
        `Telegram API Error (bebidas-info): ${response.status}`,
        'infrastructure',
        'sendTelegramBebidasInfo',
        { details: { status: response.status, body: responseBody } }
      );
      return { success: false, error };
    }

    const json = await response.json() as { ok: boolean; result: { message_id: number } };
    return { success: true, data: { messageId: json.result.message_id } };
  } catch (error) {
    const appError = await logger.logFromCatch(error, 'infrastructure', 'sendTelegramBebidasInfo');
    return { success: false, error: appError };
  }
};

/** Alert the bar group when kitchen marks comida as "preparado" — includes item list and Servido button */
export const sendTelegramPreparadoAlert = async (
  pedidoId: string,
  numeroPedido: number,
  mesaNumero: number,
  mesaNombre: string | null,
  comidaItems: { nombre: string; cantidad: number }[],
  chatId: string
): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN) return;
  const tableLabel = mesaNombre ? `${sanitizeForMarkdown(mesaNombre)} \\(Mesa ${mesaNumero}\\)` : `Mesa ${mesaNumero}`;
  const itemLines = comidaItems.map(i => `\\- ${i.cantidad}x ${sanitizeForMarkdown(i.nombre)}`);
  const lines = [
    `🍳 *Comida lista* — Pedido \\#${numeroPedido} — ${tableLabel}`,
    '',
    ...itemLines,
  ];
  const message = lines.join('\n');
  const inlineKeyboard = [[
    { text: '🍽️ Servido', callback_data: `servido:${pedidoId}` },
    { text: '🗑️ Eliminar', callback_data: `eliminar_bebidas:${pedidoId}` },
  ]];
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: inlineKeyboard } }),
      }
    );
  } catch {
    // Best-effort — do not block order flow
  }
};

/** Delete a message sent by the bot */
export const deleteMessage = async (chatId: string, messageId: number): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      }
    );
  } catch {
    // Best-effort — message may have already been deleted or is too old
  }
};

export const buildTimeButtons = (pedidoId: string): { text: string; callback_data: string }[][] => [
  [
    { text: '10 min', callback_data: `order:${pedidoId}:10` },
    { text: '15 min', callback_data: `order:${pedidoId}:15` },
  ],
  [
    { text: '20 min', callback_data: `order:${pedidoId}:20` },
    { text: '30 min', callback_data: `order:${pedidoId}:30` },
  ],
];
