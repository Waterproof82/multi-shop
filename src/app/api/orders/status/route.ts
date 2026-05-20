import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pedidoRepository } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { editMessageReplyMarkup } from '@/core/infrastructure/services/telegram.service';

const tokenSchema = z.string().uuid();

export async function GET(request: Request) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const result = await pedidoRepository.findByTrackingToken(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al buscar pedido' }, { status: 500 });
  }

  if (!result.data) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  const { id, numero_pedido, estimated_minutes, estimated_ready_at, telegram_message_id, telegram_chat_id, items } = result.data;

  // If order is ready and has a pending Telegram message, edit it and clear the id (fire-and-forget)
  const isReady = estimated_ready_at && new Date(estimated_ready_at) <= new Date();
  if (isReady && telegram_message_id && telegram_chat_id) {
    void Promise.all([
      editMessageReplyMarkup(telegram_chat_id, Number(telegram_message_id), [[{ text: '✅ Pedido listo para recoger', callback_data: 'noop' }]]),
      pedidoRepository.clearTelegramMessageId(id),
    ]);
  }

  return NextResponse.json({ numero_pedido, estimated_minutes, estimated_ready_at, items });
}
