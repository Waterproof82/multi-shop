// src/core/application/use-cases/kits/listSeriesLote.use-case.ts
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { KitSerie } from '@/core/domain/entities/kit-caducidad-types';

/** R-M4.4.5/R-M4.4.6: el lote debe ser de la propia empresa antes de listar/exportar sus series. */
export async function listSeriesLoteUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  loteId: string,
): Promise<Result<KitSerie[], AppError>> {
  const loteResult = await repo.findLoteById(empresaId, loteId);
  if (!loteResult.success) return loteResult;
  if (!loteResult.data) {
    return { success: false, error: { code: 'KIT_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' } };
  }

  return repo.findSeriesDeLote(empresaId, loteId);
}
