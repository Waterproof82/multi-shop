// src/core/application/use-cases/mascotas/obtenerRecuentoLote.use-case.ts
// sdd pet-id-qr-profile, Fase 5 — R-QR.1.2: el lote debe ser de la propia
// empresa antes de contar sus chapas (calco de `listSeriesLote.use-case.ts`).
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { RecuentoPorEstado } from '@/core/domain/entities/pet-chapa-types';

export async function obtenerRecuentoLoteUseCase(
  repo: IPetChapaAdminRepository,
  empresaId: string,
  loteId: string,
): Promise<Result<RecuentoPorEstado, AppError>> {
  const loteResult = await repo.findLoteById(empresaId, loteId);
  if (!loteResult.success) return loteResult;
  if (!loteResult.data) {
    return { success: false, error: { code: 'PET_CHAPA_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' } };
  }

  return repo.countPorEstado(empresaId, loteId);
}
