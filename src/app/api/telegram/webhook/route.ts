import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { answerCallbackQuery, editMessageText, editMessageReplyMarkup, buildTimeButtons, deleteMessage } from '@/core/infrastructure/services/telegram.service';
import { RUTAS_CALLBACK, type Contexto } from './callbacks';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

const callbackQuerySchema = z.object({
  callback_query: z.object({
    id: z.string(),
    data: z.string(),
    message: z.object({
      message_id: z.number(),
      chat: z.object({ id: z.number() }),
      text: z.string().optional(),
    }).optional(),
  }),
});

/**
 * Callbacks de los botones de los mensajes de Telegram.
 *
 * SIEMPRE responde 200 salvo en los fallos de autenticación. Telegram reintenta
 * ante cualquier otro código, y reintentar un callback ya aplicado duplicaría
 * cambios de estado del pedido. Un cuerpo que no se entiende se ignora en
 * silencio: no es un error, es tráfico que no nos toca.
 */
export async function POST(request: Request) {
  // Fail-closed: sin secreto configurado no se atiende nada. Este endpoint es
  // público y sus callbacks cambian el estado de pedidos reales.
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const parsed = callbackQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const { id, data, message } = parsed.data.callback_query;
  const ctx: Contexto = {
    callbackQueryId: id,
    message,
    servicios: { answerCallbackQuery, editMessageText, editMessageReplyMarkup, buildTimeButtons, deleteMessage, after },
  };

  for (const ruta of RUTAS_CALLBACK) {
    const coincidencia = ruta.patron.exec(data);
    if (coincidencia) {
      await ruta.manejar(ctx, coincidencia);
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
