// src/core/application/use-cases/kits/getKitLoteEditor.use-case.ts
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { KitLoteEditor } from '@/core/domain/entities/kit-caducidad-types';

/**
 * Combina el lote, sus consumibles perecederos de receta y sus caducidades ya
 * guardadas: todo lo que el editor de M4b2 necesita para pintarse. Reutiliza
 * `findLoteById` (R-M4.2.3: un lote de otra empresa no revela nada) en vez de
 * repetir el filtro `empresa_id`.
 */
export async function getKitLoteEditorUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  loteId: string,
): Promise<Result<KitLoteEditor, AppError>> {
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

  const caducidadesResult = await repo.findCaducidades(empresaId, loteId);
  if (!caducidadesResult.success) return caducidadesResult;

  return {
    success: true,
    data: { lote, consumibles: consumiblesResult.data, caducidades: caducidadesResult.data },
  };
}
