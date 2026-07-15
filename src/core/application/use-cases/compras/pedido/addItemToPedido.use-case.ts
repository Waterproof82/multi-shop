import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { PedidoCompraItem } from '@/core/domain/entities/compras-types';

const schema = z.object({
  pedidoId: z.string().uuid(),
  catalogoCompraId: z.string().uuid(),
  cantidad: z.number().positive(),
});

export async function addItemToPedidoUseCase(
  repo: IComprasRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<PedidoCompraItem, AppError>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }

  const { pedidoId, catalogoCompraId, cantidad } = parsed.data;

  const pedidoResult = await repo.findPedidoById(empresaId, pedidoId);
  if (!pedidoResult.success) {
    return pedidoResult;
  }
  if (pedidoResult.data.estado !== 'borrador') {
    return {
      success: false,
      error: {
        code: 'COMPRAS_PEDIDO_ESTADO_INVALIDO',
        message: 'Solo se pueden añadir ítems a pedidos en borrador',
        module: 'use-case',
      },
    };
  }

  const catalogoResult = await repo.findCatalogoItemById(empresaId, catalogoCompraId);
  if (!catalogoResult.success) {
    return {
      success: false,
      error: { code: 'COMPRAS_CATALOGO_NOT_FOUND', message: 'Ítem de catálogo no encontrado', module: 'use-case' },
    };
  }

  const { precioCompraCents, porcentajeIva } = catalogoResult.data;
  return repo.addItemToPedido(empresaId, pedidoId, { catalogoCompraId, cantidad, precioCompraCents, porcentajeIva });
}
