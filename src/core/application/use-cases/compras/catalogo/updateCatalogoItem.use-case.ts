import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { CatalogoCompraItem } from '@/core/domain/entities/compras-types';

const schema = z.object({
  referenciaProveedor: z.string().max(100).optional(),
  descripcion: z.string().max(500).optional(),
  precioCompraCents: z.number().int().min(0).optional(),
  unidadCompra: z.string().min(1).max(50).optional(),
  factorConversion: z.number().positive().optional(),
  porcentajeIva: z.union([z.literal(0), z.literal(4), z.literal(10), z.literal(21)]).optional(),
  activo: z.boolean().optional(),
});

export async function updateCatalogoItemUseCase(
  repo: IComprasRepository,
  empresaId: string,
  id: string,
  input: unknown,
): Promise<Result<CatalogoCompraItem, AppError>> {
  const existing = await repo.findCatalogoItemById(empresaId, id);
  if (!existing.success) {
    return {
      success: false,
      error: { code: 'COMPRAS_CATALOGO_NOT_FOUND', message: 'Ítem de catálogo no encontrado', module: 'use-case' },
    };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }

  return repo.updateCatalogoItem(empresaId, id, parsed.data);
}
