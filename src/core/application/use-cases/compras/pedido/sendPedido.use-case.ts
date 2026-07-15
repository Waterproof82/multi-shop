import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { PedidoCompra } from '@/core/domain/entities/compras-types';

export async function sendPedidoUseCase(
  repo: IComprasRepository,
  empresaId: string,
  id: string,
): Promise<Result<PedidoCompra, AppError>> {
  const pedidoResult = await repo.findPedidoById(empresaId, id);
  if (!pedidoResult.success) {
    return pedidoResult;
  }

  const pedido = pedidoResult.data;
  if (pedido.estado !== 'borrador') {
    return {
      success: false,
      error: {
        code: 'COMPRAS_PEDIDO_ESTADO_INVALIDO',
        message: 'Solo se pueden enviar pedidos en borrador',
        module: 'use-case',
      },
    };
  }

  if (!pedido.items || pedido.items.length === 0) {
    return {
      success: false,
      error: {
        code: 'COMPRAS_PEDIDO_SIN_ITEMS',
        message: 'El pedido debe tener al menos un ítem',
        module: 'use-case',
      },
    };
  }

  return repo.updatePedidoEstado(empresaId, id, 'enviado');
}
