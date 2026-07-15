import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';

export async function removePedidoItemUseCase(
  repo: IComprasRepository,
  empresaId: string,
  pedidoId: string,
  itemId: string,
): Promise<Result<void, AppError>> {
  const pedidoResult = await repo.findPedidoById(empresaId, pedidoId);
  if (!pedidoResult.success) {
    return pedidoResult;
  }
  if (pedidoResult.data.estado !== 'borrador') {
    return {
      success: false,
      error: {
        code: 'COMPRAS_PEDIDO_ESTADO_INVALIDO',
        message: 'Solo se pueden eliminar ítems de pedidos en borrador',
        module: 'use-case',
      },
    };
  }

  return repo.removePedidoItem(empresaId, pedidoId, itemId);
}
