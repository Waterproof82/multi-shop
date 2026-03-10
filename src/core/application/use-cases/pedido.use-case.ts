import { IPedidoRepository } from "@/core/domain/repositories/IPedidoRepository";
import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { Pedido } from "@/core/domain/entities/types";

export interface CreatePedidoDTO {
  items: {
    item: { id: string; name: string; price: number };
    quantity: number;
    selectedComplements?: { name: string; price: number }[];
  }[];
  total: number;
  nombre: string;
  telefono: string;
  email?: string;
}

export interface PedidoStats {
  pedidosHoy: number;
  pedidosMes: number;
  totalHoy: number;
  totalMes: number;
  totalAno: number;
  topPlatos: { nombre: string; cantidad: number; total: number }[];
  topPlatosAno: { nombre: string; cantidad: number; total: number }[];
}

export class PedidoUseCase {
  constructor(
    private readonly pedidoRepo: IPedidoRepository,
    private readonly clienteRepo: IClienteRepository
  ) {}

  async getAll(empresaId: string): Promise<Pedido[]> {
    return this.pedidoRepo.findAllByTenant(empresaId);
  }

  async updateStatus(id: string, empresaId: string, estado: string): Promise<void> {
    return this.pedidoRepo.updateStatus(id, empresaId, estado);
  }

  async create(empresaId: string, data: CreatePedidoDTO): Promise<{ id: string; numero_pedido: number }> {
    const existingCliente = await this.clienteRepo.findByTelefono(data.telefono, empresaId);

    let clienteId: string | null = null;

    if (existingCliente) {
      await this.clienteRepo.update(existingCliente.id, empresaId, {
        nombre: data.nombre,
        email: data.email || null,
      });
      clienteId = existingCliente.id;
    } else {
      const newCliente = await this.clienteRepo.create({
        empresaId,
        nombre: data.nombre,
        telefono: data.telefono,
        email: data.email || null,
      });
      clienteId = newCliente.id;
    }

    return this.pedidoRepo.create(empresaId, clienteId, data.items, data.total);
  }

  async getStats(empresaId: string, mes: number, año: number): Promise<PedidoStats> {
    return this.pedidoRepo.getStats(empresaId, mes, año);
  }

  async delete(id: string, empresaId: string): Promise<void> {
    return this.pedidoRepo.delete(id, empresaId);
  }
}
