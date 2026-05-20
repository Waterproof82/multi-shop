import { NextResponse } from 'next/server';
import { editMessageText } from '@/core/infrastructure/services/telegram.service';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const { pedidoRepository } = await import('@/core/infrastructure/database');

  const result = await pedidoRepository.findReadyPedidosWithTelegramMessage();
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  }

  const pedidos = result.data;
  if (pedidos.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  await Promise.all(
    pedidos.map(async (pedido) => {
      await editMessageText(
        pedido.telegram_chat_id,
        Number(pedido.telegram_message_id),
        '✅ Pedido listo para recoger'
      );
      await pedidoRepository.clearTelegramMessageId(pedido.id);
    })
  );

  return NextResponse.json({ ok: true, processed: pedidos.length });
}
