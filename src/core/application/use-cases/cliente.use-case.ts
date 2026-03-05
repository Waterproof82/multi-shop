import { IClienteRepository, Cliente } from "@/core/infrastructure/database/SupabaseClienteEmpresaRepository";
import { CreateClienteDTO, UpdateClienteDTO } from "@/core/application/dtos/cliente.dto";

export class ClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async getAll(empresaId: string): Promise<Cliente[]> {
    return this.clienteRepo.findAllByTenant(empresaId);
  }

  async create(data: CreateClienteDTO): Promise<Cliente> {
    return this.clienteRepo.create(data);
  }

  async update(id: string, empresaId: string, data: Partial<UpdateClienteDTO>): Promise<void> {
    return this.clienteRepo.update(id, empresaId, data);
  }

  async delete(id: string, empresaId: string): Promise<void> {
    return this.clienteRepo.delete(id, empresaId);
  }
}
