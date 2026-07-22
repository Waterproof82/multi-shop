import { IClienteRepository } from '@/core/domain/repositories/IClienteRepository';
import { Result, AppError } from '@/core/domain/entities/types';

export async function exportarClienteUseCase(
  repo: IClienteRepository,
  clienteId: string,
  empresaId: string,
): Promise<Result<Record<string, unknown>, AppError>> {
  return repo.exportarCliente(clienteId, empresaId);
}
