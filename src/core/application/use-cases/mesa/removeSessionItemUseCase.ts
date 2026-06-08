import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { pedidoRepository } from '@/core/infrastructure/database';
import { logger } from '@/core/infrastructure/logging/logger';

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

    const ordersResult = await pedidoRepository.findBySesionId(input.sesionId);
    if (!ordersResult.success) return { success: false, error: ordersResult.error };

    let cantidadRestante = input.cantidadAEliminar;
    let totalRemoved = 0;

    for (const pedido of ordersResult.data) {
      if (cantidadRestante <= 0) break;

      const items = pedido.detalle_pedido as Array<Record<string, unknown>>;

      // Find items matching nombre + precio (float comparison)
      const matching = items.filter(
        i => i.nombre === input.nombre && Math.abs(Number(i.precio) - input.precio) < 0.001
      );
      if (matching.length === 0) continue;

      const unitsInPedido = matching.reduce((s: number, i: Record<string, unknown>) => s + Number(i.cantidad), 0);
      const unitsToRemove = Math.min(unitsInPedido, cantidadRestante);

      // Rebuild detalle_pedido: remove exactly unitsToRemove units
      let toRemove = unitsToRemove;
      const newItems: Array<Record<string, unknown>> = [];
      for (const item of items) {
        const isMatch =
          item.nombre === input.nombre && Math.abs(Number(item.precio) - input.precio) < 0.001;
        if (!isMatch || toRemove === 0) {
          newItems.push(item);
        } else if (Number(item.cantidad) > toRemove) {
          newItems.push({ ...item, cantidad: Number(item.cantidad) - toRemove });
          toRemove = 0;
        } else {
          toRemove -= Number(item.cantidad);
          // item fully removed — don't push
        }
      }

      if (newItems.length === 0) {
        await supabase.from('pedidos').delete().eq('id', pedido.id);
      } else {
        // Recalculate total
        const newTotal = newItems.reduce((sum: number, i: Record<string, unknown>) => {
          const compExtra = ((i.complementos ?? []) as Record<string, unknown>[]).reduce(
            (cs: number, c: Record<string, unknown>) => cs + Number(c.precio ?? 0),
            0
          );
          return sum + (Number(i.precio) + compExtra) * Number(i.cantidad);
        }, 0);

        const updateResult = await pedidoRepository.updateOrderItems(
          pedido.id,
          newItems as { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] }[],
          newTotal
        );
        if (!updateResult.success) return { success: false, error: updateResult.error };
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
