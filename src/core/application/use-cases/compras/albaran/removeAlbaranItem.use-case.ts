import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';

export async function removeAlbaranItemUseCase(
  repo: IComprasRepository,
  empresaId: string,
  albaranId: string,
  itemId: string,
): Promise<Result<void, AppError>> {
  const albaranResult = await repo.findAlbaranById(empresaId, albaranId);
  if (!albaranResult.success) {
    return albaranResult;
  }
  if (albaranResult.data.estado === 'recibido') {
    return {
      success: false,
      error: {
        code: 'COMPRAS_ALBARAN_INMUTABLE',
        message: 'No se puede eliminar ítems de un albarán ya recibido',
        module: 'use-case',
      },
    };
  }

  return repo.removeAlbaranItem(empresaId, albaranId, itemId);
}
