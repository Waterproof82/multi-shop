import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { AlbaranCompra } from '@/core/domain/entities/compras-types';

const schema = z.object({
  proveedorId: z.string().uuid(),
  pedidoCompraId: z.string().uuid().optional(),
  numeroAlbaran: z.string().min(1).max(100),
  notas: z.string().max(1000).optional(),
});

export async function createAlbaranUseCase(
  repo: IComprasRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<AlbaranCompra, AppError>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }
  return repo.createAlbaran(empresaId, parsed.data);
}
