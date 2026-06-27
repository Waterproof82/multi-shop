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

      // Rebuild detalle_pedido: remove exactly unitsToRemove units.
      // Track old→new index mapping so mesa_item_pagos can be kept in sync.
      let toRemove = unitsToRemove;
      const newItems: Array<Record<string, unknown>> = [];
      const indexRemap = new Map<number, number>(); // old idx → new idx
      let newIdx = 0;
      for (const [oldIdx, item] of items.entries()) {
        const isMatch =
          item.nombre === input.nombre && Math.abs(Number(item.precio) - input.precio) < 0.001;
        if (!isMatch || toRemove === 0) {
          newItems.push(item);
          indexRemap.set(oldIdx, newIdx++);
        } else if (Number(item.cantidad) > toRemove) {
          newItems.push({ ...item, cantidad: Number(item.cantidad) - toRemove });
          indexRemap.set(oldIdx, newIdx++);
          toRemove = 0;
        } else {
          toRemove -= Number(item.cantidad);
          // item fully removed — not in indexRemap
        }
      }

      if (newItems.length === 0) {
        // Pedido fully removed — delete all its item payment rows
        await supabase.from('mesa_item_pagos').delete().eq('pedido_id', pedido.id);
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

        // Fix mesa_item_pagos indices that shifted due to item removal.
        // 1. Delete rows for items that were fully removed.
        const removedIndices = [...Array(items.length).keys()].filter(i => !indexRemap.has(i));
        if (removedIndices.length > 0) {
          await supabase.from('mesa_item_pagos').delete()
            .eq('pedido_id', pedido.id)
            .in('item_idx', removedIndices);
        }
        // 2. Update shifted indices (high→low to avoid conflicts).
        const shifted = Array.from(indexRemap.entries())
          .filter(([old, nw]) => old !== nw)
          .sort((a, b) => b[0] - a[0]); // descending old index
        for (const [oldI, newI] of shifted) {
          await supabase.from('mesa_item_pagos').update({ item_idx: newI })
            .eq('pedido_id', pedido.id)
            .eq('item_idx', oldI);
        }
      }

      cantidadRestante -= unitsToRemove;
      totalRemoved += unitsToRemove;
    }

    // Personalizado: after removal, check if pagadoCents now covers the full session total.
    // This handles the case where the waiter removes the last unpaid item.
    if (totalRemoved > 0) {
      const { data: sesionRow } = await supabase
        .from('mesa_sesiones')
        .select('division_tipo, sesion_pagada')
        .eq('id', input.sesionId)
        .maybeSingle();
      const sr = sesionRow as { division_tipo: string | null; sesion_pagada: boolean } | null;

      if (sr?.division_tipo === 'personalizado' && !sr.sesion_pagada) {
        const { data: pedidosRows } = await supabase
          .from('pedidos')
          .select('total')
          .eq('sesion_id', input.sesionId)
          .eq('empresa_id', input.empresaId);
        const newSessionTotalCents = Math.round(
          ((pedidosRows ?? []) as { total: number }[]).reduce((s, p) => s + Number(p.total), 0) * 100
        );

        if (newSessionTotalCents > 0) {
          const { data: pagadoRows } = await supabase
            .from('mesa_pagos_personalizados')
            .select('importe_cents')
            .eq('sesion_id', input.sesionId)
            .eq('status', 'pagado');
          const pagadoCents = ((pagadoRows ?? []) as { importe_cents: number | null }[])
            .reduce((s, t) => s + (t.importe_cents ?? 0), 0);

          if (pagadoCents >= newSessionTotalCents) {
            await supabase
              .from('pedidos')
              .update({ payment_status: 'paid' })
              .eq('sesion_id', input.sesionId)
              .eq('empresa_id', input.empresaId);
            await supabase
              .from('mesa_sesiones')
              .update({ sesion_pagada: true, pago_en_curso: false, pago_iniciado_en: null })
              .eq('id', input.sesionId);
          }
        }
      }
    }

    return { success: true, data: { totalRemoved } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'removeSessionItemUseCase', {
      details: { sesionId: input.sesionId },
    });
    return { success: false, error: appError };
  }
}
