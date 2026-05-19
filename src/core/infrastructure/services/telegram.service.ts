import { Pedido, PedidoItem } from '@/core/domain/entities/types';
import { Result, AppError } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const sanitizeForMarkdown = (text: string | number | null | undefined): string => {
  const textAsString = String(text || '');
  // Escape all reserved characters for MarkdownV2
  return textAsString.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
};

export const sendTelegramNotification = async (
  pedido: Pedido
): Promise<Result<void, AppError>> => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { 
        success: false, 
        error: { 
            code: 'TELEGRAM_NOT_CONFIGURED', 
            message: 'Telegram environment variables are not set.',
            module: 'infrastructure'
        } 
    };
  }

  const { clientes: cliente, detalle_pedido: items, total, numero_pedido } = pedido;

  const message = [
    `*Nuevo Pedido: \\#${numero_pedido}*`,
    `*Cliente:* ${sanitizeForMarkdown(cliente?.nombre)}`,
    `*Teléfono:* ${sanitizeForMarkdown(cliente?.telefono)}`,
    '\\-\\-\\-', // Escaped separator
    '*Items:*',
    ...items.map(
      (item: PedidoItem) =>
        // Escape list dash, parentheses, and all user/db content
        `\\- ${item.cantidad}x ${sanitizeForMarkdown(item.nombre)} \\(${sanitizeForMarkdown(item.precio.toFixed(2))} €\\)`
    ),
    '\\-\\-\\-', // Escaped separator
    `*Total:* ${sanitizeForMarkdown(total.toFixed(2))} €`, // Escaped total
  ].join('\n');

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'MarkdownV2',
        }),
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
