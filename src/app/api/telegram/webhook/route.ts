import { NextResponse } from 'next/server';
import { z } from 'zod';
import { answerCallbackQuery, editMessageText, buildTimeButtons } from '@/core/infrastructure/services/telegram.service';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

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

export async function POST(request: Request) {
  // Validate secret token from Telegram header
  if (WEBHOOK_SECRET) {
    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secretHeader !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }

  const parsed = callbackQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true }); // Not a callback query — ignore
  }

  const { id: callbackQueryId, data: callbackData, message } = parsed.data.callback_query;

  // Handle "modify" — restore time selector buttons (blocked if order is already ready)
  const modifyMatch = callbackData.match(/^modify:([0-9a-f-]{36})$/);
  if (modifyMatch) {
    const [, pedidoId] = modifyMatch;
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    const readyAtResult = await pedidoRepository.findEstimatedReadyAtById(pedidoId);
    const estimatedReadyAt = readyAtResult.success ? readyAtResult.data : null;
    const isReady = estimatedReadyAt && new Date(estimatedReadyAt) <= new Date();

    if (isReady) {
      await answerCallbackQuery(callbackQueryId, '✅ El pedido ya está listo para recoger');
      if (message) {
        await editMessageText(String(message.chat.id), message.message_id, '✅ Pedido listo para recoger');
      }
      return NextResponse.json({ ok: true });
    }

    await answerCallbackQuery(callbackQueryId, 'Selecciona el nuevo tiempo');
    if (message) {
      const restoredText = (message.text ?? '').replace(/\n\n✅ Tiempo fijado:.*$/s, '');
      await editMessageText(String(message.chat.id), message.message_id, restoredText, buildTimeButtons(pedidoId));
    }
    return NextResponse.json({ ok: true });
  }

  // Expected format: order:{pedidoId}:{minutes}
  const match = callbackData.match(/^order:([0-9a-f-]{36}):(\d+)$/);
  if (!match) {
    return NextResponse.json({ ok: true });
  }

  const [, pedidoId, minutesStr] = match;
  const minutes = parseInt(minutesStr, 10);

  if (isNaN(minutes) || minutes <= 0 || minutes > 180) {
    return NextResponse.json({ ok: true });
  }

  const { pedidoRepository } = await import('@/core/infrastructure/database');
  await pedidoRepository.updateEstimatedTime(pedidoId, minutes);
  await answerCallbackQuery(callbackQueryId, `⏱ Tiempo fijado: ${minutes} minutos`);

  if (message) {
    const confirmedText = `${message.text ?? ''}\n\n✅ Tiempo fijado: ${minutes} min`;
    await editMessageText(
      String(message.chat.id),
      message.message_id,
      confirmedText,
      [[{ text: '🔄 Modificar tiempo', callback_data: `modify:${pedidoId}` }]]
    );
  }

  return NextResponse.json({ ok: true });
}
