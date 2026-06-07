import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { pedidoRepository } from '@/core/infrastructure/database';
import { logger } from '@/core/infrastructure/logging/logger';
import {
  editTelegramForMesa,
  editTelegramBebidasInfoForMesa,
  deleteMessage,
} from '@/core/infrastructure/services/telegram.service';

export interface RemoveSessionItemInput {
  sesionId: string;
  empresaId: string;
  nombre: string;
  precio: number;
  cantidadAEliminar: number;
}

export interface RemoveSessionItemResult {
  totalRemoved: number;
}

export async function removeSessionItemUseCase(
  input: RemoveSessionItemInput
): Promise<Result<RemoveSessionItemResult, AppError>> {
  try {
    const supabase = getSupabaseClient();

    const ordersResult = await pedidoRepository.findBySesionIdWithTelegram(input.sesionId);
    if (!ordersResult.success) return { success: false, error: ordersResult.error };

    let cantidadRestante = input.cantidadAEliminar;
    let totalRemoved = 0;

    for (const pedido of ordersResult.data) {
      if (cantidadRestante <= 0) break;

      // Find items matching nombre + precio (float comparison)
      const matching = pedido.detalle_pedido.filter(
        i => i.nombre === input.nombre && Math.abs(i.precio - input.precio) < 0.001
      );
      if (matching.length === 0) continue;

      const unitsInPedido = matching.reduce((s, i) => s + i.cantidad, 0);
      const unitsToRemove = Math.min(unitsInPedido, cantidadRestante);

      // Rebuild detalle_pedido: remove exactly unitsToRemove units
      let toRemove = unitsToRemove;
      const newItems: typeof pedido.detalle_pedido = [];
      for (const item of pedido.detalle_pedido) {
        const isMatch =
          item.nombre === input.nombre && Math.abs(item.precio - input.precio) < 0.001;
        if (!isMatch || toRemove === 0) {
          newItems.push(item);
        } else if (item.cantidad > toRemove) {
          newItems.push({ ...item, cantidad: item.cantidad - toRemove });
          toRemove = 0;
        } else {
          toRemove -= item.cantidad;
          // item fully removed — don't push
        }
      }

      const mesaNumero = pedido.mesa_numero ?? 0;
      const mesaNombre = pedido.mesa_nombre ?? null;
      // Cocina message was auto-deleted when preparado/servido — skip it
      const cocinaActive = pedido.estado !== 'preparado' && pedido.estado !== 'servido';
      const messageId = cocinaActive && pedido.telegram_message_id ? Number(pedido.telegram_message_id) : null;
      const chatId = cocinaActive ? pedido.telegram_chat_id : null;
      // Bebidas message may still be alive for preparado orders (bar may not have pressed Servido yet)
      const bebidasActive = pedido.estado !== 'servido';
      const bebidasMessageId = bebidasActive && pedido.telegram_bebidas_message_id ? Number(pedido.telegram_bebidas_message_id) : null;
      const bebidasChatId = bebidasActive ? pedido.telegram_bebidas_chat_id : null;
      // Preparado alert message sent to bar chat — only exists for preparado orders
      const alertMessageId = pedido.estado === 'preparado' && pedido.telegram_preparado_alert_message_id ? Number(pedido.telegram_preparado_alert_message_id) : null;
      const alertChatId = pedido.estado === 'preparado' ? pedido.telegram_bebidas_chat_id : null;

      if (newItems.length === 0) {
        // Delete all Telegram messages (best-effort), then delete pedido
        if (messageId && chatId) {
          await deleteMessage(chatId, messageId);
        }
        if (bebidasMessageId && bebidasChatId) {
          await deleteMessage(bebidasChatId, bebidasMessageId);
        }
        if (alertMessageId && alertChatId) {
          await deleteMessage(alertChatId, alertMessageId);
        }
        await supabase.from('pedidos').delete().eq('id', pedido.id);
      } else {
        // Recalculate total
        const newTotal = newItems.reduce((s, i) => {
          const compExtra = (i.complementos ?? []).reduce(
            (cs, c) => cs + ((c as { precio?: number }).precio ?? 0),
            0
          );
          return s + (i.precio + compExtra) * i.cantidad;
        }, 0);

        const updateResult = await pedidoRepository.updateOrderItems(pedido.id, newItems, newTotal);
        if (!updateResult.success) return { success: false, error: updateResult.error };

        // Edit or delete comida Telegram message (only after DB write confirmed)
        const newComidaItems = newItems.filter(i => (i as { tipo_producto?: string }).tipo_producto !== 'bebida');
        if (messageId && chatId) {
          if (newComidaItems.length > 0) {
            await editTelegramForMesa(pedido.id, pedido.numero_pedido, newComidaItems, mesaNumero, mesaNombre, chatId, messageId);
          } else {
            await deleteMessage(chatId, messageId);
          }
        }

        // Edit or delete bebidas Telegram message
        const newBebidasItems = newItems.filter(i => (i as { tipo_producto?: string }).tipo_producto === 'bebida');
        if (bebidasMessageId && bebidasChatId) {
          if (newBebidasItems.length > 0) {
            await editTelegramBebidasInfoForMesa(pedido.id, pedido.numero_pedido, newBebidasItems, mesaNumero, mesaNombre, bebidasChatId, bebidasMessageId);
          } else {
            await deleteMessage(bebidasChatId, bebidasMessageId);
          }
        }

        // Delete preparado alert message — it listed the comida items before deletion; no longer accurate
        if (alertMessageId && alertChatId) {
          await deleteMessage(alertChatId, alertMessageId);
        }
      }

      cantidadRestante -= unitsToRemove;
      totalRemoved += unitsToRemove;
    }

    return { success: true, data: { totalRemoved } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'removeSessionItemUseCase', {
      details: { sesionId: input.sesionId },
    });
    return { success: false, error: appError };
  }
}
