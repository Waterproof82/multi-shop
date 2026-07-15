import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { PedidoCompraItem } from '@/core/domain/entities/compras-types';

const schema = z.object({
  cantidad: z.number().positive(),
});

export async function updatePedidoItemUseCase(
  repo: IComprasRepository,
  empresaId: string,
  pedidoId: string,
  itemId: string,
  input: unknown,
): Promise<Result<PedidoCompraItem, AppError>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }

  const pedidoResult = await repo.findPedidoById(empresaId, pedidoId);
  if (!pedidoResult.success) {
    return pedidoResult;
  }
  if (pedidoResult.data.estado !== 'borrador') {
    return {
      success: false,
      error: {
        code: 'COMPRAS_PEDIDO_ESTADO_INVALIDO',
        message: 'Solo se pueden modificar ítems de pedidos en borrador',
        module: 'use-case',
      },
    };
  }

  return repo.updatePedidoItem(empresaId, pedidoId, itemId, parsed.data.cantidad);
}
