import type { IComprasRepository } from '@/core/domain/repositories/IComprasRepository';
import type { Result, AppError } from '@/core/domain/entities/types';

export async function deleteProveedorUseCase(
  repo: IComprasRepository,
  empresaId: string,
  id: string,
): Promise<Result<void, AppError>> {
  const existing = await repo.findProveedorById(empresaId, id);
  if (!existing.success) {
    return {
      success: false,
      error: { code: 'COMPRAS_PROVEEDOR_NOT_FOUND', message: 'Proveedor no encontrado', module: 'use-case' },
    };
  }

  const hasTransactions = await repo.hasActiveTransactions(empresaId, id);
  if (!hasTransactions.success) {
    return hasTransactions;
  }
  if (hasTransactions.data) {
    return {
      success: false,
      error: {
        code: 'COMPRAS_PROVEEDOR_HAS_TRANSACTIONS',
        message: 'El proveedor tiene transacciones activas y no puede eliminarse',
        module: 'use-case',
      },
    };
  }

  return repo.softDeleteProveedor(empresaId, id);
}
