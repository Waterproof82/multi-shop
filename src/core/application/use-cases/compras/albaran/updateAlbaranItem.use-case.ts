import { z } from 'zod';
import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { AlbaranCompraItem } from '@/core/domain/entities/compras-types';

const schema = z.object({
  catalogoCompraId: z.string().uuid().optional(),
  cantidadRecibida: z.number().positive().optional(),
  precioCompraCents: z.number().int().min(0).optional(),
  porcentajeIva: z.union([z.literal(0), z.literal(4), z.literal(10), z.literal(21)]).optional(),
  numeroLote: z.string().max(100).optional(),
  fechaCaducidad: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function updateAlbaranItemUseCase(
  repo: IComprasRepository,
  empresaId: string,
  albaranId: string,
  itemId: string,
  input: unknown,
): Promise<Result<AlbaranCompraItem, AppError>> {
  const albaranResult = await repo.findAlbaranById(empresaId, albaranId);
  if (!albaranResult.success) {
    return albaranResult;
  }
  if (albaranResult.data.estado === 'recibido') {
    return {
      success: false,
      error: {
        code: 'COMPRAS_ALBARAN_INMUTABLE',
        message: 'No se puede modificar un albarán ya recibido',
        module: 'use-case',
      },
    };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' },
    };
  }

  return repo.updateAlbaranItem(empresaId, albaranId, itemId, parsed.data);
}
