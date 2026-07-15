import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { PedidoCompra } from '@/core/domain/entities/compras-types';

const schema = z.object({
  proveedorId: z.string().uuid(),
  notas: z.string().max(1000).optional(),
  fechaEntregaEstimada: z.string().datetime({ offset: true }).optional().or(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ),
});

function generateNumeroPedido(): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const random4 = Math.floor(Math.random() * 1679616).toString(36).toUpperCase().padStart(4, '0');
  return `PC-${yyyy}${mm}${dd}-${random4}`;
}

export async function createPedidoCompraUseCase(
  repo: IComprasRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<PedidoCompra, AppError>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }
  const numeroPedido = generateNumeroPedido();
  return repo.createPedido(empresaId, parsed.data, numeroPedido);
}
