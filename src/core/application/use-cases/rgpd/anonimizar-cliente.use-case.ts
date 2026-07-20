import { IClienteRepository } from '@/core/domain/repositories/IClienteRepository';
import { Result, AppError } from '@/core/domain/entities/types';

export async function anonimizarClienteUseCase(
  repo: IClienteRepository,
  clienteId: string,
  empresaId: string,
): Promise<Result<void, AppError>> {
  return repo.anonimizarCliente(clienteId, empresaId);
}
