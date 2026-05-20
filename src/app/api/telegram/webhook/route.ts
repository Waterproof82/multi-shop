import { NextResponse } from 'next/server';
import { z } from 'zod';
import { answerCallbackQuery } from '@/core/infrastructure/services/telegram.service';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const callbackQuerySchema = z.object({
  callback_query: z.object({
    id: z.string(),
    data: z.string(),
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

  const { id: callbackQueryId, data: callbackData } = parsed.data.callback_query;

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

  // Import the repository here to avoid circular dependency issues
  const { pedidoRepository } = await import('@/core/infrastructure/database');
  await pedidoRepository.updateEstimatedTime(pedidoId, minutes);
  await answerCallbackQuery(callbackQueryId, `⏱ Pedido actualizado a ${minutes} minutos`);

  return NextResponse.json({ ok: true });
}
