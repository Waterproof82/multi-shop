// src/core/application/use-cases/kits/listLineasCandidatas.use-case.ts
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { CandidatasLote } from '@/core/domain/entities/kit-caducidad-types';

/**
 * DD8/R-M4.3.5: combina, para el editor de caducidades de un lote, las
 * líneas de albarán candidatas a fuente de fecha (solo para los consumibles
 * perecederos de la receta del kit) con los valores `parte` que la propia
 * empresa ya usó, para el autocompletado. `loteId` llega ya validado desde
 * la ruta (`loteIdQuerySchema`), igual que `getKitLoteEditorUseCase`.
 */
export async function listLineasCandidatasUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  loteId: string,
): Promise<Result<CandidatasLote, AppError>> {
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

  const partesResult = await repo.findPartesUsadas(empresaId);
  if (!partesResult.success) return partesResult;

  const ingredienteIds = consumiblesResult.data.filter((c) => c.esPerecedero).map((c) => c.ingredienteId);
  if (ingredienteIds.length === 0) {
    return { success: true, data: { lineas: [], partesUsadas: partesResult.data } };
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const lineasResult = await repo.findLineasCandidatas(empresaId, ingredienteIds, hoy);
  if (!lineasResult.success) return lineasResult;

  return { success: true, data: { lineas: lineasResult.data, partesUsadas: partesResult.data } };
}
