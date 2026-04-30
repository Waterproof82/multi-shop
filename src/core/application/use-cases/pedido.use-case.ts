import { IPedidoRepository } from "@/core/domain/repositories/IPedidoRepository";
import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { ICodigoDescuentoRepository } from "@/core/domain/repositories/ICodigoDescuentoRepository";
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
  idioma?: string;
  codigoDescuento?: string;
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

/**
 * Result of discount validation for pedido creation
 */
type DiscountResult = {
  applied: true;
  codigoDescuentoId: string;
  descuentoPorcentaje: number;
  totalSinDescuento: number;
  finalTotal: number;
} | {
  applied: false;
};

export class PedidoUseCase {
  constructor(
    private readonly pedidoRepo: IPedidoRepository,
    private readonly clienteRepo: IClienteRepository,
    private readonly productRepo: IProductRepository,
    private readonly descuentoRepo: ICodigoDescuentoRepository
  ) {}

  /**
   * Find or create client - handles phone legacy format (34 prefix)
   */
  private async findOrCreateCliente(
    empresaId: string,
    nombre: string,
    telefono: string,
    email: string | undefined,
    idioma: string | undefined
  ): Promise<Result<{ clienteId: string }>> {
    const telefonoDigits = telefono.replaceAll(/\D/g, '');
    
    // Step 1: Find existing client
    const clienteResult = await this.clienteRepo.findByTelefono(telefonoDigits, empresaId);
    if (!clienteResult.success) {
      return { success: false, error: clienteResult.error };
    }

    // Step 2: Check legacy format (9-digit without prefix)
    if (!clienteResult.data && telefonoDigits.length > 9) {
      const legacyResult = await this.findLegacyCliente(telefonoDigits, empresaId, telefono);
      if (legacyResult.success && legacyResult.data) {
        return { success: true, data: { clienteId: legacyResult.data.id } };
      }
    }

    const existingCliente = clienteResult.data;

    // Step 3: Update existing or create new
    if (existingCliente) {
      const updateResult = await this.clienteRepo.update(existingCliente.id, empresaId, {
        nombre,
        email: email || null,
        idioma,
      });
      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }
      return { success: true, data: { clienteId: existingCliente.id } };
    }

    const createResult = await this.clienteRepo.create({
      empresaId,
      nombre,
      telefono: telefonoDigits,
      email: email || null,
      idioma: idioma || 'es',
    });
    if (!createResult.success) {
      return { success: false, error: createResult.error };
    }

    return { success: true, data: { clienteId: createResult.data.id } };
  }

  /**
   * Find legacy client record with "34" prefix removed
   */
  private async findLegacyCliente(
    telefonoDigits: string,
    empresaId: string,
    newTelefono: string
  ): Promise<Result<{ id: string }>> {
    const withoutPrefix = telefonoDigits.replace(/^34/, '');
    if (withoutPrefix.length !== 9) {
      return { success: false, error: { code: 'INVALID_PHONE', message: 'Invalid phone format', module: 'use-case', method: 'findLegacyCliente' } };
    }

    const legacyResult = await this.clienteRepo.findByTelefono(withoutPrefix, empresaId);
    if (!legacyResult.success) {
      return { success: false, error: legacyResult.error };
    }

    if (legacyResult.data) {
      // Update legacy phone to new format
      const updateResult = await this.clienteRepo.update(legacyResult.data.id, empresaId, { telefono: newTelefono });
      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }
    }

    return { success: true, data: legacyResult.data ? { id: legacyResult.data.id } : { id: '' } };
  }

  /**
   * Validate all product IDs exist and build price map
   */
  private async validateProductPrices(
    empresaId: string,
    data: CreatePedidoDTO['items']
  ): Promise<Result<{ priceMap: Map<string, number>; serverTotal: number }>> {
    const productIds = data
      .map(ci => ci.item?.id)
      .filter((id): id is string => Boolean(id));

    const complementIds = data
      .flatMap(ci => ci.selectedComplements ?? [])
      .map(c => c.id)
      .filter((id): id is string => Boolean(id));

    const allIds = [...new Set([...productIds, ...complementIds])];

    if (allIds.length === 0) {
      return { success: true, data: { priceMap: new Map(), serverTotal: 0 } };
    }

    const productsResult = await this.productRepo.findByIds(allIds, empresaId);
    if (!productsResult.success) {
      return { success: false, error: productsResult.error };
    }

    const priceMap = new Map(productsResult.data.map(p => [p.id, p.precio]));

    // Verify all product IDs exist
    for (const ci of data) {
      const pid = ci.item?.id;
      if (pid && !priceMap.has(pid)) {
        return {
          success: false,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: `Producto no encontrado: ${pid}`,
            module: 'use-case',
            method: 'PedidoUseCase.validateProductPrices',
          },
        };
      }
      for (const c of ci.selectedComplements ?? []) {
        if (c.id && !priceMap.has(c.id)) {
          return {
            success: false,
            error: {
              code: 'PRODUCT_NOT_FOUND',
              message: `Complemento no encontrado: ${c.id}`,
              module: 'use-case',
              method: 'PedidoUseCase.validateProductPrices',
            },
          };
        }
      }
    }

    const serverTotal = data.reduce((sum, ci) => {
      const unitPrice = priceMap.get(ci.item?.id ?? '') ?? 0;
      const complementsTotal = (ci.selectedComplements ?? []).reduce(
        (cs, c) => cs + (priceMap.get(c.id) ?? 0),
        0
      );
      return sum + (unitPrice + complementsTotal) * ci.quantity;
    }, 0);

    return { success: true, data: { priceMap, serverTotal } };
  }

  /**
   * Apply discount code if valid
   */
  private async applyDiscount(
    empresaId: string,
    codigoDescuento: string,
    email: string,
    serverTotal: number
  ): Promise<Result<DiscountResult>> {
    const codigoResult = await this.descuentoRepo.findByCodigo(codigoDescuento.toUpperCase(), empresaId);
    if (!codigoResult.success) {
      return { success: false, error: codigoResult.error };
    }

    const descuento = codigoResult.data;
    if (!descuento) {
      return { success: true, data: { applied: false } };
    }

    if (descuento.usado) {
      return { success: false, error: { code: 'CODE_ALREADY_USED', message: 'Discount code has already been used', module: 'use-case', method: 'applyDiscount' } };
    }
    if (new Date(descuento.fechaExpiracion) < new Date()) {
      return { success: false, error: { code: 'CODE_EXPIRED', message: 'Discount code has expired', module: 'use-case', method: 'applyDiscount' } };
    }
    if (descuento.clienteEmail.toLowerCase() !== email.toLowerCase()) {
      return { success: false, error: { code: 'EMAIL_MISMATCH', message: 'Email does not match discount code', module: 'use-case', method: 'applyDiscount' } };
    }

    const finalTotal = Math.round(serverTotal * (1 - descuento.porcentajeDescuento / 100) * 100) / 100;
    return {
      success: true,
      data: {
        applied: true,
        codigoDescuentoId: descuento.id,
        descuentoPorcentaje: descuento.porcentajeDescuento,
        totalSinDescuento: serverTotal,
        finalTotal,
      },
    };
  }

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

  async getAllByMonth(empresaId: string, mes: number, año: number): Promise<Result<Pedido[]>> {
    try {
      const result = await this.pedidoRepo.findAllByTenantAndMonth(empresaId, mes, año);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'PedidoUseCase.getAllByMonth' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.getAllByMonth', { empresaId, details: { mes, año } });
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

  /**
   * Create new order - uses helper methods to reduce complexity
   */
  async create(empresaId: string, data: CreatePedidoDTO): Promise<Result<{ id: string; numero_pedido: number; total: number }>> {
    try {
      // Step 1: Find or create client
      const clienteResult = await this.findOrCreateCliente(
        empresaId,
        data.nombre,
        data.telefono,
        data.email,
        data.idioma
      );
      if (!clienteResult.success) {
        return { success: false, error: clienteResult.error };
      }

      // Step 2: Validate products and calculate server total
      const priceResult = await this.validateProductPrices(empresaId, data.items);
      if (!priceResult.success) {
        return { success: false, error: priceResult.error };
      }

      // Step 3: Apply discount if provided
      let finalTotal = priceResult.data.serverTotal;
      let discountData: { codigoDescuentoId: string; descuentoPorcentaje: number; totalSinDescuento: number } | undefined;

      if (data.codigoDescuento && data.email) {
        const discountResult = await this.applyDiscount(
          empresaId,
          data.codigoDescuento,
          data.email,
          priceResult.data.serverTotal
        );
        if (!discountResult.success) {
          return { success: false, error: discountResult.error };
        }
        if (discountResult.data.applied) {
          discountData = {
            codigoDescuentoId: discountResult.data.codigoDescuentoId,
            descuentoPorcentaje: discountResult.data.descuentoPorcentaje,
            totalSinDescuento: discountResult.data.totalSinDescuento,
          };
          finalTotal = discountResult.data.finalTotal;
        }
      }

      // Step 4: Create the order
      const pedidoResult = await this.pedidoRepo.create(
        empresaId,
        clienteResult.data.clienteId,
        data.items,
        finalTotal,
        discountData
      );
      if (!pedidoResult.success) {
        return { success: false, error: pedidoResult.error };
      }

      // Step 5: Mark discount code as used
      if (discountData) {
        await this.descuentoRepo.markAsUsed(discountData.codigoDescuentoId, pedidoResult.data.id);
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

  async deleteAll(empresaId: string): Promise<Result<number>> {
    try {
      const result = await this.pedidoRepo.deleteAllByTenant(empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'PedidoUseCase.deleteAll' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.deleteAll', { empresaId });
      return { success: false, error: appError };
    }
  }
}