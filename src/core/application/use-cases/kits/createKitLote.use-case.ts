// src/core/application/use-cases/kits/createKitLote.use-case.ts
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { KitLote } from '@/core/domain/entities/kit-caducidad-types';
import { createKitLoteSchema } from '@/core/application/dtos/kit-caducidad.dto';

/**
 * DD7: un kit es un producto de la empresa con al menos un consumible
 * (`receta_items` → `ingredientes.es_perecedero = true`). `findConsumiblesDelKit`
 * ya filtra por `empresa_id`, así que un producto de otra empresa devuelve la
 * lista vacía y cae en el mismo error de validación que "no es un kit"
 * (R-M4.2.3: nunca revela si el id existe).
 */
export async function createKitLoteUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<KitLote, AppError>> {
  const parsed = createKitLoteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }

  const consumiblesResult = await repo.findConsumiblesDelKit(empresaId, parsed.data.productoId);
  if (!consumiblesResult.success) return consumiblesResult;

  const esKit = consumiblesResult.data.some((c) => c.esPerecedero);
  if (!esKit) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'El producto no es un kit con consumibles perecederos de esta empresa',
        module: 'use-case',
      },
    };
  }

  return repo.createLote(empresaId, parsed.data);
}
