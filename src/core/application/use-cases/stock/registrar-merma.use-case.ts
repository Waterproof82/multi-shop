import { IStockRepository } from '@/core/domain/repositories/IStockRepository';
import { RegistrarMermaPayload, Merma } from '@/core/domain/entities/stock-types';
import { Result, AppError } from '@/core/domain/entities/types';

export async function registrarMermaUseCase(
  repo: IStockRepository,
  payload: RegistrarMermaPayload,
): Promise<Result<Merma, AppError>> {
  if (payload.cantidad <= 0) {
    return {
      success: false,
      error: {
        code: 'STOCK_MERMA_CANTIDAD_INVALIDA',
        message: 'La cantidad de merma debe ser mayor que cero',
        module: 'use-case',
        method: 'registrarMermaUseCase',
      },
    };
  }

  if (!payload.operadorNombre.trim()) {
    return {
      success: false,
      error: {
        code: 'STOCK_MERMA_OPERADOR_REQUERIDO',
        message: 'El nombre del operador es obligatorio',
        module: 'use-case',
        method: 'registrarMermaUseCase',
      },
    };
  }

  return repo.createMerma(payload);
}
