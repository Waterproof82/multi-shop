import { IStockRepository } from '@/core/domain/repositories/IStockRepository';
import { Ingrediente } from '@/core/domain/entities/stock-types';
import { Result, AppError } from '@/core/domain/entities/types';

export async function getLowStockAlertsUseCase(
  repo: IStockRepository,
  empresaId: string,
): Promise<Result<Ingrediente[], AppError>> {
  return repo.findLowStockAlerts(empresaId);
}
