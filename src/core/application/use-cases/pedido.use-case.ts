import { IPedidoRepository } from "@/core/domain/repositories/IPedidoRepository";
import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { ICodigoDescuentoRepository } from "@/core/domain/repositories/ICodigoDescuentoRepository";
import { IMesaSesionRepository } from "@/core/domain/repositories/IMesaSesionRepository";
import { AppError, Pedido, Result } from "@/core/domain/entities/types";
import { logger } from "@/core/infrastructure/logging/logger";
import { IDEMPOTENCY_REPLAY_CODE } from "@/core/domain/constants/pedido";
import { sendTelegramWithInlineButtons, sendTelegramWithQuickReplies } from '@/core/infrastructure/services/telegram.service';

/**
 * Clave de reintento + huella del contenido. Ver `src/lib/idempotency.ts`.
 * La construye la capa de API a partir de la cabecera y del cuerpo ya validado;
 * nunca llega desde el cuerpo de la petición.
 */
export interface IdempotencyContext {
  key: string;
  fingerprint: string;
}

/**
 * Misma clave, contenido distinto. Es un error del cliente, no del servidor: o
 * reutilizó una clave por descuido o alguien está intentando reproducir la
 * petición de otro para quedarse con su `tracking_token`. La API lo traduce a
 * 409, que es la semántica estándar de `Idempotency-Key`.
 */
export const IDEMPOTENCY_MISMATCH_CODE = 'IDEMPOTENCY_MISMATCH';

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

  /** `limit` acota el histórico traído — ver findAllByTenant en el repositorio. */
  async getAll(empresaId: string, limit?: number): Promise<Result<Pedido[]>> {
    try {
      const result = await this.pedidoRepo.findAllByTenant(empresaId, limit);
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
   * Determine if order requires tracking token based on type and origin
   */
  private shouldGenerateTrackingToken(
    empresaTipo: string,
    esPedidos: boolean,
    isDelivery: boolean
  ): boolean {
    return (empresaTipo === 'restaurante' && esPedidos) || empresaTipo === 'tienda' || isDelivery;
  }

  /**
   * Calculate final total including delivery fee and discount
   */
  private calculateFinalTotal(
    serverTotal: number,
    isDelivery: boolean,
    deliveryFeeCents: number | undefined,
    discountData?: { applied: true; finalTotal: number } | { applied: false }
  ): number {
    let total = serverTotal;
    
    // Apply discount first
    if (discountData?.applied) {
      total = discountData.finalTotal;
    }
    
    // Add delivery fee
    if (isDelivery && deliveryFeeCents) {
      total = Math.round((total * 100 + deliveryFeeCents)) / 100;
    }
    
    return total;
  }

  private buildTelegramPedido(
    pedidoId: string,
    empresaId: string,
    clienteId: string,
    numeroPedido: number,
    total: number,
    data: CreatePedidoDTO,
    trackingToken: string | undefined
  ): Pedido {
    return {
      id: pedidoId,
      empresa_id: empresaId,
      cliente_id: clienteId,
      numero_pedido: numeroPedido,
      detalle_pedido: data.items.map(ci => ({
        producto_id: ci.item?.id,
        nombre: ci.item?.name ?? '',
        precio: ci.item?.price ?? 0,
        cantidad: ci.quantity,
        complementos: (ci.selectedComplements ?? []).map(c => ({ nombre: c.name, precio: c.price })),
      })),
      total,
      moneda: null,
      estado: 'pendiente',
      created_at: new Date().toISOString(),
      tracking_token: trackingToken ?? null,
      estimated_minutes: null,
      estimated_ready_at: null,
      clientes: { nombre: data.nombre, email: data.email ?? '', telefono: data.telefono },
    };
  }

  private async sendTelegramButtons(chatId: string, pedidoId: string, pedido: Pedido): Promise<void> {
    const r = await sendTelegramWithInlineButtons(pedido, chatId);
    if (r.success) await this.pedidoRepo.saveTelegramMessageId(pedidoId, r.data.messageId);
  }

  private async sendTelegramReplies(chatId: string, pedidoId: string, pedido: Pedido): Promise<void> {
    const r = await sendTelegramWithQuickReplies(pedido, chatId);
    if (r.success) await this.pedidoRepo.saveTelegramMessageId(pedidoId, r.data.messageId);
  }

  private async notifyTelegramForCreate(
    telegramChatId: string | null,
    pedido: Pedido,
    empresaTipo: string,
    esPedidos: boolean,
    isDelivery: boolean,
    pagosPickupHabilitados: boolean,
    origen: string | undefined,
  ): Promise<void> {
    const isPickupWithPayment = pagosPickupHabilitados && (origen === 'recogida' || empresaTipo !== 'restaurante');
    if (!telegramChatId || isDelivery || isPickupWithPayment) return;
    if (empresaTipo === 'restaurante' && esPedidos) {
      await this.sendTelegramButtons(telegramChatId, pedido.id, pedido);
    } else {
      await this.sendTelegramReplies(telegramChatId, pedido.id, pedido);
    }
  }

  private buildOrigenPayload(data: CreatePedidoDTO, isDelivery: boolean) {
    if (!data.origen) return undefined;
    return {
      origen: data.origen,
      ...(isDelivery ? {
        direccion_entrega: data.direccion_entrega,
        codigo_postal: data.codigo_postal,
        latitude_entrega: data.latitude_entrega,
        longitude_entrega: data.longitude_entrega,
        estimated_delivery_fee_cents: data.estimated_delivery_fee_cents,
      } : {}),
    };
  }

  /**
   * ¿Esta clave de idempotencia ya creó un pedido?
   *
   * Devuelve `null` cuando no —el caso normal, un envío nuevo— y el pedido
   * original cuando sí. Devolverlo tal cual es lo que convierte un reenvío en
   * una operación inocua: el cliente recibe el mismo número, el mismo total y
   * el mismo `tracking_token` que la primera vez, y la cocina no ve nada.
   *
   * Si la clave coincide pero la huella no, corta con `IDEMPOTENCY_MISMATCH`.
   * Ese caso NO puede devolver el pedido encontrado: sería entregar el
   * `tracking_token` de un pedido ajeno a quien acertó la clave.
   */
  private async findIdempotentReplay(
    empresaId: string,
    idempotency: IdempotencyContext
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; tracking_token: string | null } | null>> {
    const existing = await this.pedidoRepo.findByIdempotencyKey(empresaId, idempotency.key);
    if (!existing.success) return { success: false, error: existing.error };
    if (!existing.data) return { success: true, data: null };

    if (existing.data.fingerprint !== idempotency.fingerprint) {
      return {
        success: false,
        error: {
          code: IDEMPOTENCY_MISMATCH_CODE,
          message: 'La clave de idempotencia ya se usó con un pedido distinto',
          module: 'use-case',
          method: 'findIdempotentReplay',
        },
      };
    }
    return { success: true, data: existing.data };
  }

  /**
   * Atajo para las rutas de creación: devuelve la respuesta ya resuelta cuando
   * el envío es un reenvío (o cuando la clave choca), y `null` cuando hay que
   * seguir adelante y crear el pedido de verdad.
   */
  private async shortCircuitOnReplay(
    empresaId: string,
    idempotency: IdempotencyContext | undefined
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }> | null> {
    if (!idempotency) return null;
    const replay = await this.findIdempotentReplay(empresaId, idempotency);
    if (!replay.success) return { success: false, error: replay.error };
    if (!replay.data) return null;
    const { id, numero_pedido, total, tracking_token } = replay.data;
    return { success: true, data: { id, numero_pedido, total, trackingToken: tracking_token ?? undefined } };
  }

  /**
   * Traduce el fallo del INSERT. La colisión de clave no es un error: significa
   * que el envío gemelo ganó la carrera, así que se relee su pedido. Cualquier
   * otro código se propaga tal cual.
   */
  private async mapCreateFailure(
    error: AppError,
    empresaId: string,
    idempotency: IdempotencyContext | undefined
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>> {
    if (idempotency && error.code === IDEMPOTENCY_REPLAY_CODE) {
      return this.resolveReplayAfterRace(empresaId, idempotency);
    }
    return { success: false, error };
  }

  /**
   * Resolución de la carrera: el índice único rechazó nuestro INSERT porque el
   * envío gemelo ya había creado el pedido. Se relee y se devuelve.
   *
   * Si la relectura no encuentra nada, algo no cuadra —la fila existía hace un
   * instante— y se devuelve error en vez de inventarse una respuesta.
   */
  private async resolveReplayAfterRace(
    empresaId: string,
    idempotency: IdempotencyContext
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>> {
    const resolved = await this.shortCircuitOnReplay(empresaId, idempotency);
    return resolved ?? {
      success: false,
      error: {
        code: 'DB_ERROR',
        message: 'No se pudo resolver el pedido tras una colisión de clave',
        module: 'use-case',
        method: 'resolveReplayAfterRace',
      },
    };
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
    pagosPickupHabilitados: boolean = false,
    idempotency?: IdempotencyContext
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>> {
    try {
      // Step 0: Reenvío del mismo pedido. Va ANTES de todo lo demás a propósito.
      // Los pasos que siguen no son repetibles: `findOrCreateCliente` toca PII y
      // `applyDiscount` consume el código de descuento. Reintentar sin este corte
      // devolvía CODE_ALREADY_USED — un 400 al comensal cuyo pedido SÍ había
      // entrado. Salir aquí también evita duplicar el aviso de Telegram.
      const replayed = await this.shortCircuitOnReplay(empresaId, idempotency);
      if (replayed) return replayed;

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

      // Step 3.5: Calculate delivery fee and tracking token
      const isDelivery = data.origen === 'delivery';
      finalTotal = this.calculateFinalTotal(
        priceResult.data.serverTotal,
        isDelivery,
        data.estimated_delivery_fee_cents,
        discountData ? { applied: true, finalTotal } : { applied: false }
      );
      const trackingToken = this.shouldGenerateTrackingToken(empresaTipo, esPedidos, isDelivery)
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
        this.buildOrigenPayload(data, isDelivery),
        idempotency
      );
      if (!pedidoResult.success) {
        return this.mapCreateFailure(pedidoResult.error, empresaId, idempotency);
      }

      // Step 5: Mark discount code as used
      if (discountData) {
        await this.descuentoRepo.markAsUsed(discountData.codigoDescuentoId, pedidoResult.data.id);
      }

      // Step 6: Send Telegram notification
      // Delivery/pickup-with-payment orders skip — webhook confirms payment first
      const pedidoParaNotificar = this.buildTelegramPedido(
        pedidoResult.data.id, empresaId, clienteResult.data.clienteId,
        pedidoResult.data.numero_pedido, pedidoResult.data.total,
        data, trackingToken
      );
      await this.notifyTelegramForCreate(
        telegramChatId, pedidoParaNotificar, empresaTipo, esPedidos,
        isDelivery, pagosPickupHabilitados, data.origen
      );

      return { success: true, data: { ...pedidoResult.data, trackingToken } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'PedidoUseCase.create', { empresaId });
      return { success: false, error: appError };
    }
  }

  /**
   * Igual que `shortCircuitOnReplay`, pero para la ruta de mesa, donde el
   * `trackingToken` no es opcional: es lo que el comensal usa para seguir su
   * comanda, y devolver la respuesta sin él sería peor que fallar.
   */
  private async shortCircuitMesaReplay(
    empresaId: string,
    idempotency: IdempotencyContext | undefined
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken: string }> | null> {
    const replayed = await this.shortCircuitOnReplay(empresaId, idempotency);
    if (!replayed) return null;
    if (!replayed.success) return { success: false, error: replayed.error };
    const { trackingToken } = replayed.data;
    if (!trackingToken) {
      // Toda comanda de mesa nace con token (el repositorio lo exige), así que
      // llegar aquí significa que la fila está corrupta. Mejor decirlo.
      return {
        success: false,
        error: { code: 'DB_ERROR', message: 'Pedido de mesa sin tracking_token', module: 'use-case', method: 'createMesaOrder' },
      };
    }
    return { success: true, data: { ...replayed.data, trackingToken } };
  }

  /** Contraparte de `mapCreateFailure` para la ruta de mesa. */
  private async mapMesaCreateFailure(
    error: AppError,
    empresaId: string,
    idempotency: IdempotencyContext | undefined
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken: string }>> {
    if (idempotency && error.code === IDEMPOTENCY_REPLAY_CODE) {
      const resolved = await this.shortCircuitMesaReplay(empresaId, idempotency);
      if (resolved) return resolved;
    }
    return { success: false, error };
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
    initialEstado: 'pendiente' | 'retenido' | 'pendiente_validacion' = 'pendiente',
    idempotency?: IdempotencyContext
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken: string }>> {
    try {
      // Step 0: reenvío del mismo pedido — ver el comentario equivalente en `create`.
      // Aquí importa además porque `openSesion` reabriría la sesión de la mesa.
      const replayed = await this.shortCircuitMesaReplay(empresaId, idempotency);
      if (replayed) return replayed;

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
        idempotency,
      });
      if (!pedidoResult.success) {
        return this.mapMesaCreateFailure(pedidoResult.error, empresaId, idempotency);
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