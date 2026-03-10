import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { Cliente } from "@/core/domain/entities/types";
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

  async togglePromoSubscription(email: string, empresaId: string, action?: 'alta' | 'baja'): Promise<boolean | null> {
    const cliente = await this.clienteRepo.findByEmail(email, empresaId);
    if (!cliente) return null;

    let nuevoValor: boolean;
    if (action === 'alta') {
      nuevoValor = true;
    } else if (action === 'baja') {
      nuevoValor = false;
    } else {
      nuevoValor = !cliente.aceptar_promociones;
    }

    await this.clienteRepo.update(cliente.id, empresaId, { aceptar_promociones: nuevoValor });
    return nuevoValor;
  }
}
