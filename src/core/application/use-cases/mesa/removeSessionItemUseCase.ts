import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { pedidoRepository } from '@/core/infrastructure/database';
import { logger } from '@/core/infrastructure/logging/logger';
import {
  editTelegramForMesa,
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
      const messageId = pedido.telegram_message_id ? Number(pedido.telegram_message_id) : null;
      const chatId = pedido.telegram_chat_id;

      if (newItems.length === 0) {
        // Delete Telegram message first (best-effort), then delete pedido
        if (messageId && chatId) {
          await deleteMessage(chatId, messageId);
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

        // Edit Telegram message if one exists — only after DB write confirmed
        if (messageId && chatId) {
          await editTelegramForMesa(
            pedido.id,
            pedido.numero_pedido,
            newItems,
            mesaNumero,
            mesaNombre,
            chatId,
            messageId
          );
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
