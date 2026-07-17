import { IPedidoRepository } from "@/core/domain/repositories/IPedidoRepository";
import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { ICodigoDescuentoRepository } from "@/core/domain/repositories/ICodigoDescuentoRepository";
import { IMesaSesionRepository } from "@/core/domain/repositories/IMesaSesionRepository";
import { Pedido, Result } from "@/core/domain/entities/types";
import { logger } from "@/core/infrastructure/logging/logger";
import { sendTelegramWithInlineButtons, sendTelegramWithQuickReplies } from '@/core/infrastructure/services/telegram.service';

export interface CreatePedidoDTO {
  items: {
    item: { id: string; name: string; price: number; translations?: { en?: { name: string }; fr?: { name: string }; it?: { name: string }; de?: { name: string } } };
    quantity: number;
    selectedComplements?: { id: string; name: string; price: number }[];
    note?: string;
  }[];
  /** Client-supplied total is ignored — the server recalculates it from DB prices */
  total?: number;
  nombre: string;
  telefono: string;
  email?: string;
  idioma?: string;
  codigoDescuento?: string;
  // Delivery fields (restaurant only)
  origen?: 'recogida' | 'delivery';
  direccion_entrega?: string;
  codigo_postal?: string;
  latitude_entrega?: number;
  longitude_entrega?: number;
  estimated_delivery_fee_cents?: number;
}

export interface CreateMesaPedidoDTO {
  items: CreatePedidoDTO['items'];
  mesa_id: string; // UUID
  idioma?: string;
  nota?: string;
  pase?: string;
}

export interface PedidoStats {
  pedidosHoy: number;
  pedidosMes: number;
  totalHoy: number;
  totalMes: number;
  totalAno: number;
  topPlatos: { nombre: string; cantidad: number; total: number }[];
  topPlatosAno: { nombre: string; cantidad: number; total: number }[];
  pedidosPorDia: { dia: number; mesa: number; recogida: number; delivery: number; web: number }[];
  clientesNuevos: number;
  clientesRecurrentes: number;
  ticketMedio: number;
  ticketMedioAnterior: number;
  pedidosAnterior: number;
  ingresosAnterior: number;
  byOrigen: {
    mesa:     { pedidos: number; total: number };
    recogida: { pedidos: number; total: number };
    delivery: { pedidos: number; total: number };
    web:      { pedidos: number; total: number };
  };
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
    private readonly descuentoRepo: ICodigoDescuentoRepository,
    private readonly mesaSesionRepo: IMesaSesionRepository
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
      if (legacyResult.success && legacyResult.data?.id) {
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
  ): Promise<Result<{ priceMap: Map<string, number>; tipoProductoMap: Map<string, 'comida' | 'bebida'>; serverTotal: number }>> {
    const productIds = data
      .map(ci => ci.item?.id)
      .filter((id): id is string => Boolean(id));

    const complementIds = data
      .flatMap(ci => ci.selectedComplements ?? [])
      .map(c => c.id)
      .filter((id): id is string => Boolean(id));

    const allIds = [...new Set([...productIds, ...complementIds])];

    if (allIds.length === 0) {
      return { success: true, data: { priceMap: new Map(), tipoProductoMap: new Map(), serverTotal: 0 } };
    }

    const productsResult = await this.productRepo.findByIds(allIds, empresaId);
    if (!productsResult.success) {
      return { success: false, error: productsResult.error };
    }

    const priceMap = new Map(productsResult.data.map(p => [p.id, p.precio]));
    const tipoProductoMap = new Map(productsResult.data.map(p => [p.id, p.tipoProducto]));

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
      // New-system complement opciones are not products — skip product lookup for them.
      // Their price is taken from the client payload (already sourced from DB in the frontend).
    }

    const serverTotal = data.reduce((sum, ci) => {
      const unitPrice = priceMap.get(ci.item?.id ?? '') ?? 0;
      const complementsTotal = (ci.selectedComplements ?? []).reduce(
        // For old-system complements (products), validate server price.
        // For new-system opcion IDs not in priceMap, trust the client-sent price.
        (cs, c) => cs + (priceMap.get(c.id) ?? c.price),
        0
      );
      return sum + (unitPrice + complementsTotal) * ci.quantity;
    }, 0);

    return { success: true, data: { priceMap, tipoProductoMap, serverTotal } };
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
  async create(
    empresaId: string,
    data: CreatePedidoDTO,
    empresaTipo: string = 'tienda',
    telegramChatId: string | null = null,
    esPedidos: boolean = false,
    pagosPickupHabilitados: boolean = false
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>> {
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

      // Step 3.5: Add delivery fee to total for delivery orders
      const isDelivery = data.origen === 'delivery';
      if (isDelivery && data.estimated_delivery_fee_cents) {
        const feeCents = data.estimated_delivery_fee_cents;
        finalTotal = Math.round((finalTotal * 100 + feeCents)) / 100;
      }
      const trackingToken = (empresaTipo === 'restaurante' && esPedidos) || empresaTipo === 'tienda' || isDelivery
        ? crypto.randomUUID()
        : undefined;

      // Step 4: Create the order
      // Pass origen for both delivery and recogida so the Redsys webhook can identify order type
      const pedidoResult = await this.pedidoRepo.create(
        empresaId,
        clienteResult.data.clienteId,
        data.items,
        finalTotal,
        discountData,
        trackingToken,
        data.origen ? {
          origen: data.origen,
          ...(isDelivery ? {
            direccion_entrega: data.direccion_entrega,
            codigo_postal: data.codigo_postal,
            latitude_entrega: data.latitude_entrega,
            longitude_entrega: data.longitude_entrega,
            estimated_delivery_fee_cents: data.estimated_delivery_fee_cents,
          } : {})
        } : undefined
      );
      if (!pedidoResult.success) {
        return { success: false, error: pedidoResult.error };
      }

      // Step 5: Mark discount code as used
      if (discountData) {
        await this.descuentoRepo.markAsUsed(discountData.codigoDescuentoId, pedidoResult.data.id);
      }

      // Step 6: Send Telegram notification
      // Delivery orders: always skip — payment must be confirmed first via Redsys webhook
      // Pickup/tienda orders with pagosPickupHabilitados: also skip until webhook confirms payment
      const isDeliveryOrder = data.origen === 'delivery';
      const isPickupWithPayment = pagosPickupHabilitados && (data.origen === 'recogida' || empresaTipo !== 'restaurante');
      if (telegramChatId && pedidoResult.data && !isDeliveryOrder && !isPickupWithPayment) {
        const pedidoParaNotificar: import('@/core/domain/entities/types').Pedido = {
          id: pedidoResult.data.id,
          empresa_id: empresaId,
          cliente_id: clienteResult.data.clienteId,
          numero_pedido: pedidoResult.data.numero_pedido,
          detalle_pedido: data.items.map(ci => ({
            producto_id: ci.item?.id,
            nombre: ci.item?.name ?? '',
            precio: ci.item?.price ?? 0,
            cantidad: ci.quantity,
            complementos: (ci.selectedComplements ?? []).map(c => ({ nombre: c.name, precio: c.price })),
          })),
          total: pedidoResult.data.total,
          moneda: null,
          estado: 'pendiente',
          created_at: new Date().toISOString(),
          tracking_token: trackingToken ?? null,
          estimated_minutes: null,
          estimated_ready_at: null,
          clientes: {
            nombre: data.nombre,
            email: data.email ?? '',
            telefono: data.telefono,
          },
        };

        if (empresaTipo === 'restaurante' && esPedidos) {
          const telegramResult = await sendTelegramWithInlineButtons(pedidoParaNotificar, telegramChatId);
          if (telegramResult.success) {
            await this.pedidoRepo.saveTelegramMessageId(pedidoResult.data.id, telegramResult.data.messageId);
          }
        } else {
          const telegramResult = await sendTelegramWithQuickReplies(pedidoParaNotificar, telegramChatId);
          if (telegramResult.success) {
            await this.pedidoRepo.saveTelegramMessageId(pedidoResult.data.id, telegramResult.data.messageId);
          }
        }
      }

      return { success: true, data: { ...pedidoResult.data, trackingToken } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.create', { empresaId });
      return { success: false, error: appError };
    }
  }

  /**
   * Create a mesa order — no cliente required, no PII collected.
   * In-app kitchen/bar replaces Telegram notifications for mesa orders.
   */
  async createMesaOrder(
    empresaId: string,
    data: CreateMesaPedidoDTO,
    mesaNumero: number,
    mesaNombre: string | null,
    initialEstado: 'pendiente' | 'retenido' | 'pendiente_validacion' = 'pendiente'
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken: string }>> {
    try {
      // Step 1: Validate products and calculate server total
      const priceResult = await this.validateProductPrices(empresaId, data.items);
      if (!priceResult.success) {
        return { success: false, error: priceResult.error };
      }

      const { serverTotal, priceMap, tipoProductoMap } = priceResult.data;
      const trackingToken = crypto.randomUUID();

      // Step 2: Build items for repo (nombre + cantidad + precio + complementos)
      const repoItems = data.items.map(ci => ({
        producto_id: ci.item?.id,
        nombre: ci.item?.name ?? '',
        cantidad: ci.quantity,
        precio: priceMap.get(ci.item?.id ?? '') ?? ci.item?.price ?? 0,
        tipo_producto: tipoProductoMap.get(ci.item?.id ?? '') ?? 'comida',
        translations: ci.item?.translations,
        complementos: ci.selectedComplements?.map(c => ({ nombre: c.name, precio: c.price })) ?? [],
        nota: ci.note || undefined,
        pase: data.pase ?? null,
      }));

      // Step 3: Ensure an active session exists (idempotent), then attach it to the order.
      let sesionId: string | null = null;
      await this.mesaSesionRepo.openSesion(data.mesa_id, empresaId);
      const sesionResult = await this.mesaSesionRepo.findActiveSesionByMesa(data.mesa_id);
      if (sesionResult.success && sesionResult.data) {
        sesionId = sesionResult.data.id;
      }

      // Step 4: Create the order
      const pedidoResult = await this.pedidoRepo.createMesaOrder({
        empresaId,
        mesaId: data.mesa_id,
        items: repoItems,
        total: serverTotal,
        trackingToken,
        sesionId,
        initialEstado,
        nota: data.nota,
        pase: data.pase ?? null,
      });
      if (!pedidoResult.success) {
        return { success: false, error: pedidoResult.error };
      }

      return {
        success: true,
        data: {
          id: pedidoResult.data.id,
          numero_pedido: pedidoResult.data.numero_pedido,
          total: serverTotal,
          trackingToken,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.createMesaOrder', { empresaId });
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