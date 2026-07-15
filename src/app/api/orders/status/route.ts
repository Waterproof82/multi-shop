import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPedidoRepository } from '@/core/infrastructure/database';
import { rateLimitTracking } from '@/core/infrastructure/api/rate-limit';
import { editMessageReplyMarkup } from '@/core/infrastructure/services/telegram.service';

const tokenSchema = z.string().uuid();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const rateLimited = await rateLimitTracking(parsed.data);
  if (rateLimited) return rateLimited;

  const result = await getPedidoRepository().findByTrackingToken(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al buscar pedido' }, { status: 500 });
  }

  if (!result.data) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  // Failed payment or delivered → treat as non-existent: clears banner and tracking page
  if (result.data.payment_status === 'failed' || result.data.estado === 'entregado') {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  const { id, numero_pedido, estimated_minutes, estimated_ready_at, telegram_message_id, telegram_chat_id, items, tipo, estado, glovo_status, delivery_fee_cents } = result.data;

  // If order is ready and has a pending Telegram message, edit it and clear the id (fire-and-forget)
  const isReady = estimated_ready_at && new Date(estimated_ready_at) <= new Date();
  if (isReady && telegram_message_id && telegram_chat_id) {
    void Promise.all([
      editMessageReplyMarkup(telegram_chat_id, Number(telegram_message_id), [[{ text: '✅ Pedido listo para recoger', callback_data: 'noop' }]]),
      getPedidoRepository().clearTelegramMessageId(id),
    ]);
  }

  return NextResponse.json({ numero_pedido, estimated_minutes, estimated_ready_at, items, tipo, estado, glovo_status, delivery_fee_cents });
}
