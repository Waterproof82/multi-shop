import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { CatalogoCompraItem } from '@/core/domain/entities/compras-types';

const schema = z.object({
  proveedorId: z.string().uuid(),
  ingredienteId: z.string().uuid(),
  referenciaProveedor: z.string().max(100).optional(),
  descripcion: z.string().max(500).optional(),
  precioCompraCents: z.number().int().min(0),
  unidadCompra: z.string().min(1).max(50),
  factorConversion: z.number().positive(),
  porcentajeIva: z.union([z.literal(0), z.literal(4), z.literal(10), z.literal(21)]),
});

export async function createCatalogoItemUseCase(
  repo: IComprasRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<CatalogoCompraItem, AppError>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }
  return repo.createCatalogoItem(empresaId, parsed.data);
}
