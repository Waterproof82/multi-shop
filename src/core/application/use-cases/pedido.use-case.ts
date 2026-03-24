import { IPedidoRepository } from "@/core/domain/repositories/IPedidoRepository";
import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { Pedido, Result } from "@/core/domain/entities/types";
import { logger } from "@/core/infrastructure/logging/logger";

export interface CreatePedidoDTO {
  items: {
    item: { id: string; name: string; price: number };
    quantity: number;
    selectedComplements?: { id: string; name: string; price: number }[];
  }[];
  /** Client-supplied total is ignored — the server recalculates it from DB prices */
  total?: number;
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
  pedidosPorDia: { dia: number; pedidos: number; ingresos: number }[];
  clientesNuevos: number;
  clientesRecurrentes: number;
  ticketMedio: number;
  ticketMedioAnterior: number;
  pedidosAnterior: number;
  ingresosAnterior: number;
}

export class PedidoUseCase {
  constructor(
    private readonly pedidoRepo: IPedidoRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly productRepo: IProductRepository
  ) {}

  async getAll(empresaId: string): Promise<Result<Pedido[]>> {
    try {
      const result = await this.pedidoRepo.findAllByTenant(empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'PedidoUseCase.getAll' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.getAll', { empresaId });
      return { success: false, error: appError };
    }
  }

  async updateStatus(id: string, empresaId: string, estado: string): Promise<Result<void>> {
    try {
      const result = await this.pedidoRepo.updateStatus(id, empresaId, estado);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'PedidoUseCase.updateStatus' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.updateStatus', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(empresaId: string, data: CreatePedidoDTO): Promise<Result<{ id: string; numero_pedido: number; total: number }>> {
    try {
      let clienteResult = await this.clienteRepo.findByTelefono(data.telefono, empresaId);
      if (!clienteResult.success) {
        return { success: false, error: clienteResult.error };
      }

      // Backward compatibility: if no match, try with "34" prefix for legacy 9-digit records
      if (!clienteResult.data && data.telefono.length > 9) {
        const withoutPrefix = data.telefono.replace(/^34/, '');
        if (withoutPrefix !== data.telefono && withoutPrefix.length === 9) {
          const legacyResult = await this.clienteRepo.findByTelefono(withoutPrefix, empresaId);
          if (legacyResult.success && legacyResult.data) {
            // Update the legacy record's phone to the new format
            await this.clienteRepo.update(legacyResult.data.id, empresaId, { telefono: data.telefono });
            clienteResult = legacyResult;
          }
        }
      }

      let clienteId: string | null = null;
      const existingCliente = clienteResult.data;

      if (existingCliente) {
        const updateResult = await this.clienteRepo.update(existingCliente.id, empresaId, {
          nombre: data.nombre,
          email: data.email || null,
        });
        if (!updateResult.success) {
          return { success: false, error: updateResult.error };
        }
        clienteId = existingCliente.id;
      } else {
        const createResult = await this.clienteRepo.create({
          empresaId,
          nombre: data.nombre,
          telefono: data.telefono,
          email: data.email || null,
        });
        if (!createResult.success) {
          return { success: false, error: createResult.error };
        }
        clienteId = createResult.data.id;
      }

      // Recalculate total server-side from DB prices to prevent price tampering.
      // Includes complement IDs so both product and complement prices are validated against DB.
      const productIds = data.items
        .map(ci => ci.item?.id)
        .filter((id): id is string => Boolean(id));

      const complementIds = data.items
        .flatMap(ci => ci.selectedComplements ?? [])
        .map(c => c.id)
        .filter((id): id is string => Boolean(id));

      const allIds = [...new Set([...productIds, ...complementIds])];

      let priceMap: Map<string, number> = new Map();
      if (allIds.length > 0) {
        const productsResult = await this.productRepo.findByIds(allIds, empresaId);
        if (!productsResult.success) {
          return { success: false, error: productsResult.error };
        }
        priceMap = new Map(productsResult.data.map(p => [p.id, p.precio]));
      }

      const serverTotal = data.items.reduce((sum, ci) => {
        // Use authoritative DB price if product exists, otherwise fall back to declared price
        const unitPrice = priceMap.get(ci.item?.id ?? '') ?? ci.item?.price ?? 0;
        const complementsTotal = (ci.selectedComplements ?? []).reduce(
          (cs, c) => cs + (priceMap.get(c.id) ?? c.price ?? 0),
          0
        );
        return sum + (unitPrice + complementsTotal) * ci.quantity;
      }, 0);

      const pedidoResult = await this.pedidoRepo.create(empresaId, clienteId, data.items, serverTotal);
      if (!pedidoResult.success) {
        return { success: false, error: pedidoResult.error };
      }

      return { success: true, data: pedidoResult.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.create', { empresaId });
      return { success: false, error: appError };
    }
  }

  async getStats(empresaId: string, mes: number, año: number): Promise<Result<PedidoStats>> {
    try {
      const result = await this.pedidoRepo.getStats(empresaId, mes, año);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'PedidoUseCase.getStats' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.getStats', { empresaId });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const result = await this.pedidoRepo.delete(id, empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'PedidoUseCase.delete' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.delete', { empresaId });
      return { success: false, error: appError };
    }
  }
}
