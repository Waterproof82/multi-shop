import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { PedidoCompra } from '@/core/domain/entities/compras-types';

function buildEstadoInvalidoError(message: string): { success: false; error: AppError } {
  return {
    success: false,
    error: {
      code: 'COMPRAS_PEDIDO_ESTADO_INVALIDO',
      message,
      module: 'use-case',
    },
  };
}

export async function cancelPedidoUseCase(
  repo: IComprasRepository,
  empresaId: string,
  id: string,
): Promise<Result<PedidoCompra, AppError>> {
  const pedidoResult = await repo.findPedidoById(empresaId, id);
  if (!pedidoResult.success) {
    return pedidoResult;
  }

  const { estado } = pedidoResult.data;
  if (estado === 'recibido') {
    return buildEstadoInvalidoError('No se puede cancelar un pedido ya recibido');
  }
  if (estado === 'cancelado') {
    return buildEstadoInvalidoError('El pedido ya está cancelado');
  }

  return repo.updatePedidoEstado(empresaId, id, 'cancelado');
}
