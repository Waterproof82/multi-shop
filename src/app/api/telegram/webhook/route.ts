import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { answerCallbackQuery, editMessageText, editMessageReplyMarkup, buildTimeButtons, sendTelegramPreparadoAlert, deleteMessage } from '@/core/infrastructure/services/telegram.service';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

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
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    await pedidoRepository.updateStatusById(pedidoId, 'pendiente');
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

  // Handle anotado — mark as noted; keep Preparado button visible
  const anotadoMatch = callbackData.match(/^anotado:([0-9a-f-]{36})$/);
  if (anotadoMatch) {
    const [, pedidoId] = anotadoMatch;
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    await pedidoRepository.updateStatusById(pedidoId, 'anotado');
    await answerCallbackQuery(callbackQueryId, '✅ Pedido anotado');
    if (message) {
      await editMessageReplyMarkup(String(message.chat.id), message.message_id, [
        [
          { text: '✅ Anotado ✓', callback_data: 'noop' },
          { text: '🍳 Preparado', callback_data: `preparado:${pedidoId}` },
        ],
        [{ text: '🔄 Modificar', callback_data: `modify_mesa:${pedidoId}` }],
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  // Handle preparado — food ready; notify bar group; auto-delete comida message after 5s (cancellable)
  const preparadoMatch = callbackData.match(/^preparado:([0-9a-f-]{36})$/);
  if (preparadoMatch) {
    const [, pedidoId] = preparadoMatch;
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    await pedidoRepository.updateStatusById(pedidoId, 'preparado');
    await answerCallbackQuery(callbackQueryId, '🍳 Comida preparada — eliminando en 5s');

    // Notify bar group if configured
    const mesaCtxResult = await pedidoRepository.findMesaContextForWebhook(pedidoId);
    if (mesaCtxResult.success && mesaCtxResult.data) {
      const { numero_pedido, mesa_numero, mesa_nombre, telegram_bebidas_chat_id, comidaItems } = mesaCtxResult.data;
      if (telegram_bebidas_chat_id) {
        await sendTelegramPreparadoAlert(pedidoId, numero_pedido, mesa_numero, mesa_nombre, comidaItems, telegram_bebidas_chat_id);
      }
    }

    // Show countdown buttons — keep original order text intact
    if (message) {
      const chatId = String(message.chat.id);
      const messageId = message.message_id;
      await editMessageReplyMarkup(chatId, messageId, [
        [
          { text: '🍳 Preparado ✓', callback_data: 'noop' },
          { text: '❌ Cancelar (5s)', callback_data: `cancelar_preparado:${pedidoId}` },
        ],
      ]);
      // After 5s: delete only if status is still 'preparado' (not cancelled)
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const { pedidoRepository: repo } = await import('@/core/infrastructure/database');
        const statusResult = await repo.findStatusById(pedidoId);
        if (statusResult.success && statusResult.data === 'preparado') {
          await deleteMessage(chatId, messageId);
        }
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Handle cancelar_preparado — cancel comida deletion, restore to pre-preparado buttons
  const cancelarPreparadoMatch = callbackData.match(/^cancelar_preparado:([0-9a-f-]{36})$/);
  if (cancelarPreparadoMatch) {
    const [, pedidoId] = cancelarPreparadoMatch;
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    await pedidoRepository.updateStatusById(pedidoId, 'anotado');
    await answerCallbackQuery(callbackQueryId, '↩️ Eliminación cancelada');
    if (message) {
      await editMessageReplyMarkup(String(message.chat.id), message.message_id, [
        [
          { text: '✅ Anotado ✓', callback_data: 'noop' },
          { text: '🍳 Preparado', callback_data: `preparado:${pedidoId}` },
        ],
        [{ text: '🔄 Modificar', callback_data: `modify_mesa:${pedidoId}` }],
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  // Handle servido — mark as served; auto-delete message after 5s (cancellable)
  const servidoMatch = callbackData.match(/^servido:([0-9a-f-]{36})$/);
  if (servidoMatch) {
    const [, pedidoId] = servidoMatch;
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    await pedidoRepository.updateStatusById(pedidoId, 'servido');
    await answerCallbackQuery(callbackQueryId, '🍽️ Pedido servido — eliminando en 5s');
    if (message) {
      const chatId = String(message.chat.id);
      const messageId = message.message_id;
      await editMessageReplyMarkup(chatId, messageId, [
        [
          { text: '🍽️ Servido ✓', callback_data: 'noop' },
          { text: '❌ Cancelar (5s)', callback_data: `cancelar_servido:${pedidoId}` },
        ],
      ]);
      // After 5s: delete only if status is still 'servido' (not cancelled)
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const { pedidoRepository: repo } = await import('@/core/infrastructure/database');
        const statusResult = await repo.findStatusById(pedidoId);
        if (statusResult.success && statusResult.data === 'servido') {
          await deleteMessage(chatId, messageId);
        }
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Handle cancelar_servido — cancel servido deletion, restore Servido button
  const cancelarServidoMatch = callbackData.match(/^cancelar_servido:([0-9a-f-]{36})$/);
  if (cancelarServidoMatch) {
    const [, pedidoId] = cancelarServidoMatch;
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    await pedidoRepository.updateStatusById(pedidoId, 'preparado');
    await answerCallbackQuery(callbackQueryId, '↩️ Eliminación cancelada');
    if (message) {
      await editMessageReplyMarkup(String(message.chat.id), message.message_id, [
        [{ text: '🍽️ Servido', callback_data: `servido:${pedidoId}` }],
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

  // Handle modify_mesa — restore initial Anotado/Preparado buttons
  const modifyMesaMatch = callbackData.match(/^modify_mesa:([0-9a-f-]{36})$/);
  if (modifyMesaMatch) {
    const [, pedidoId] = modifyMesaMatch;
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    await pedidoRepository.updateStatusById(pedidoId, 'pendiente');
    await answerCallbackQuery(callbackQueryId, 'Selecciona una opción');
    if (message) {
      await editMessageReplyMarkup(String(message.chat.id), message.message_id, [
        [
          { text: '✅ Anotado', callback_data: `anotado:${pedidoId}` },
          { text: '🍳 Preparado', callback_data: `preparado:${pedidoId}` },
        ],
      ]);
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
    const { pedidoRepository } = await import('@/core/infrastructure/database');
    await pedidoRepository.updateStatusById(pedidoId, action);
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
    await editMessageReplyMarkup(String(message.chat.id), message.message_id, [
      [{ text: `✅ Tiempo fijado: ${minutes} min`, callback_data: 'noop' }],
      [{ text: '🔄 Modificar tiempo', callback_data: `modify:${pedidoId}` }],
    ]);
  }

  return NextResponse.json({ ok: true });
}
