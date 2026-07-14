import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { answerCallbackQuery, editMessageText, editMessageReplyMarkup, buildTimeButtons, deleteMessage } from '@/core/infrastructure/services/telegram.service';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

const sanitizeMarkdown = (text: string): string =>
  text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');

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
  // Validate secret token from Telegram header — fail-closed if secret is not configured
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secretHeader !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
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
    const { getPedidoRepository } = await import('@/core/infrastructure/database');
    const readyAtResult = await getPedidoRepository().findEstimatedReadyAtById(pedidoId);
    const estimatedReadyAt = readyAtResult.success ? readyAtResult.data : null;
    const isReady = estimatedReadyAt && new Date(estimatedReadyAt) <= new Date();

    if (isReady) {
      await answerCallbackQuery(callbackQueryId, '✅ El pedido ya está listo para recoger');
      if (message) {
        await editMessageReplyMarkup(String(message.chat.id), message.message_id, [[{ text: '✅ Pedido listo para recoger', callback_data: 'noop' }]]);
      }
      return NextResponse.json({ ok: true });
    }

    await answerCallbackQuery(callbackQueryId, 'Selecciona el nuevo tiempo');
    if (message) {
      await editMessageReplyMarkup(String(message.chat.id), message.message_id, buildTimeButtons(pedidoId));
    }
    return NextResponse.json({ ok: true });
  }

  // Handle "modify_reply" — restore quick-reply buttons for tienda orders
  const modifyReplyMatch = callbackData.match(/^modify_reply:([0-9a-f-]{36})$/);
  if (modifyReplyMatch) {
    const [, pedidoId] = modifyReplyMatch;
    const { getPedidoRepository } = await import('@/core/infrastructure/database');
    await getPedidoRepository().updateStatusById(pedidoId, 'pendiente');
    await answerCallbackQuery(callbackQueryId, 'Selecciona una respuesta');
    if (message) {
      const baseText = (message.text ?? '').replace(/\n\n[💬📞].+$/s, '');
      await editMessageText(String(message.chat.id), message.message_id, sanitizeMarkdown(baseText), [
        [{ text: '💬 Te contestaremos lo más pronto posible', callback_data: `quick_reply:${pedidoId}:soon` }],
        [{ text: '📞 Te llamamos ahora en cuanto tengamos un momento', callback_data: `quick_reply:${pedidoId}:call` }],
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  // Handle eliminar — delete the Telegram message
  const eliminarMatch = callbackData.match(/^eliminar:([0-9a-f-]{36})$/);
  if (eliminarMatch) {
    await answerCallbackQuery(callbackQueryId, '🗑️ Mensaje eliminado');
    if (message) {
      await deleteMessage(String(message.chat.id), message.message_id);
    }
    return NextResponse.json({ ok: true });
  }

  // Dismiss spinner for read-only "ready" button
  if (callbackData === 'noop') {
    await answerCallbackQuery(callbackQueryId, '');
    return NextResponse.json({ ok: true });
  }

  // Handle quick reply acknowledgement
  const quickReplyMatch = callbackData.match(/^quick_reply:([0-9a-f-]{36}):(soon|call)$/);
  if (quickReplyMatch) {
    const [, pedidoId, action] = quickReplyMatch;
    const selectedText = action === 'soon'
      ? '💬 Te contestaremos lo más pronto posible'
      : '📞 Te llamamos ahora en cuanto tengamos un momento';
    const { getPedidoRepository } = await import('@/core/infrastructure/database');
    await getPedidoRepository().updateStatusById(pedidoId, action);
    await answerCallbackQuery(callbackQueryId, selectedText);
    if (message) {
      const baseText = (message.text ?? '').replace(/\n\n[💬📞].+$/s, '');
      const updatedText = `${sanitizeMarkdown(baseText)}\n\n${sanitizeMarkdown(selectedText)}`;
      await editMessageText(String(message.chat.id), message.message_id, updatedText, [
        [{ text: `✅ ${selectedText}`, callback_data: 'noop' }],
        [{ text: '🔄 Modificar respuesta', callback_data: `modify_reply:${pedidoId}` }],
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  // Handle entregado — mark as delivered; auto-delete message after 5s (cancellable)
  const entregadoMatch = callbackData.match(/^entregado:([0-9a-f-]{36}):(\d+)$/);
  if (entregadoMatch) {
    const [, pedidoId, minutesStr] = entregadoMatch;
    const { getPedidoRepository } = await import('@/core/infrastructure/database');
    await getPedidoRepository().updateStatusById(pedidoId, 'entregado');
    await answerCallbackQuery(callbackQueryId, '✅ Pedido entregado — eliminando en 5s');
    if (message) {
      const chatId = String(message.chat.id);
      const messageId = message.message_id;
      await editMessageReplyMarkup(chatId, messageId, [
        [
          { text: '✅ Entregado ✓', callback_data: 'noop' },
          { text: '❌ Cancelar (5s)', callback_data: `cancelar_entregado:${pedidoId}:${minutesStr}` },
        ],
      ]);
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const { getPedidoRepository: repo } = await import('@/core/infrastructure/database');
        const statusResult = await repo().findStatusById(pedidoId);
        if (statusResult.success && statusResult.data === 'entregado') {
          await deleteMessage(chatId, messageId);
        }
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Handle cancelar_entregado — cancel delivery deletion, restore time buttons
  const cancelarEntregadoMatch = callbackData.match(/^cancelar_entregado:([0-9a-f-]{36}):(\d+)$/);
  if (cancelarEntregadoMatch) {
    const [, pedidoId, minutesStr] = cancelarEntregadoMatch;
    const minutes = parseInt(minutesStr, 10);
    const { getPedidoRepository } = await import('@/core/infrastructure/database');
    await getPedidoRepository().updateStatusById(pedidoId, 'pendiente');
    await answerCallbackQuery(callbackQueryId, '↩️ Eliminación cancelada');
    if (message) {
      await editMessageReplyMarkup(String(message.chat.id), message.message_id, [
        [{ text: `✅ Tiempo fijado: ${minutes} min`, callback_data: 'noop' }],
        [
          { text: '🔄 Modificar tiempo', callback_data: `modify:${pedidoId}` },
          { text: '✅ Entregado', callback_data: `entregado:${pedidoId}:${minutesStr}` },
        ],
      ]);
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

  const { getPedidoRepository } = await import('@/core/infrastructure/database');
  await getPedidoRepository().updateEstimatedTime(pedidoId, minutes);
  await answerCallbackQuery(callbackQueryId, `⏱ Tiempo fijado: ${minutes} minutos`);

  if (message) {
    await editMessageReplyMarkup(String(message.chat.id), message.message_id, [
      [{ text: `✅ Tiempo fijado: ${minutes} min`, callback_data: 'noop' }],
      [
        { text: '🔄 Modificar tiempo', callback_data: `modify:${pedidoId}` },
        { text: '✅ Entregado', callback_data: `entregado:${pedidoId}:${minutes}` },
      ],
    ]);
  }

  return NextResponse.json({ ok: true });
}
