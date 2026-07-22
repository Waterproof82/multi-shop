import { IClienteRepository } from '@/core/domain/repositories/IClienteRepository';
import { Result, AppError } from '@/core/domain/entities/types';

export async function purgeExpiredClientesUseCase(
  repo: IClienteRepository,
): Promise<Result<number, AppError>> {
  return repo.purgeExpiredClientes();
}
