// src/core/application/use-cases/kits/replaceKitLoteCaducidades.use-case.ts
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { CaducidadInput } from '@/core/domain/entities/kit-caducidad-types';
import { replaceCaducidadesSchema } from '@/core/application/dtos/kit-caducidad.dto';

/**
 * DD9 (parte del caso de uso, no del Zod): el `.refine()`/`.superRefine()` del
 * DTO ya exige el XOR por ítem y rechaza `(ingredienteId, parte)` duplicados,
 * pero solo el caso de uso conoce la receta del lote — por eso comprueba
 * aquí que cada consumible perecedero tenga al menos una fila, señalando su
 * nombre si falta (R-M4.3.1).
 */
export async function replaceKitLoteCaducidadesUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  loteId: string,
  input: unknown,
): Promise<Result<void, AppError>> {
  const parsed = replaceCaducidadesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }

  const loteResult = await repo.findLoteById(empresaId, loteId);
  if (!loteResult.success) return loteResult;
  if (!loteResult.data) {
    return {
      success: false,
      error: { code: 'KIT_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' },
    };
  }
  const lote = loteResult.data;

  const consumiblesResult = await repo.findConsumiblesDelKit(empresaId, lote.productoId);
  if (!consumiblesResult.success) return consumiblesResult;

  const perecederos = consumiblesResult.data.filter((c) => c.esPerecedero);
  const ingredientesConFuente = new Set(parsed.data.items.map((item) => item.ingredienteId));
  const faltante = perecederos.find((c) => !ingredientesConFuente.has(c.ingredienteId));
  if (faltante) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Falta una fuente de fecha para el consumible perecedero "${faltante.nombre}"`,
        module: 'use-case',
      },
    };
  }

  const items: CaducidadInput[] = parsed.data.items.map((item) => ({
    ingredienteId: item.ingredienteId,
    parte: item.parte,
    albaranCompraItemId: item.albaranCompraItemId ?? null,
    caducaEl: item.caducaEl ?? null,
  }));

  return repo.replaceCaducidades(empresaId, loteId, items);
}
