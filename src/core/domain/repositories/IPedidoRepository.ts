import { Pedido, CartItem, Result } from "../entities/types";

export interface KitchenBarCounts {
  cocina: { total: number; listos: number; retenidos: number };
  bebidas: { total: number; listos: number; retenidos: number };
}

export interface KitchenOrderItem {
  id: string;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  items: { nombre: string; cantidad: number; complementos?: { nombre?: string; name?: string }[] }[];
  estado: string;
  createdAt: string;
  sesionId: string | null;
}

export interface RetenidoItem {
  itemId: string;
  nombre: string;
  cantidad: number;
  complementos?: string;
  mesaId: string | null;
  mesaNumero: number | null;
  mesaNombre: string | null;
  sesionCreatedAt: string;
}

/**
 * A pending bar order as seen by the bar page.
 *
 * `items` contains only bebida items not yet served (filtered server-side
 * by pedido_item_estados so all bar screens share the same view).
 *
 * `detallePedidoIdx` — real position of each item inside detalle_pedido.
 * Used as a stable swipe key and as the PATCH path param for per-item status.
 *
 * `hasComida` — true when the parent pedido also contains comida items.
 * The bar page uses this to choose the correct order-level estado transition:
 *   - false → PATCH pedido to `servido` (all done)
 *   - true  → PATCH pedido to `anotado` (kitchen items must remain visible)
 */
export interface BarOrderItem {
  id: string;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  items: { nombre: string; cantidad: number; detallePedidoIdx: number; nota?: string }[];
  estado: string;
  createdAt: string;
  sesionId: string | null;
  tipo: 'bebida';
  hasComida: boolean;
}

/** Estado values for per-item kitchen tracking */
export type ItemEstado = 'pendiente' | 'en_preparacion' | 'listo' | 'servido' | 'retenido' | 'cancelado';

/** A single food item from a mesa order, with its kitchen estado */
export interface KitchenItemRecord {
  pedidoId: string;
  numeroPedido: number;
  itemIdx: number;
  nombre: string;
  cantidad: number;
  complementos?: string;
  nota?: string;
  estado: ItemEstado;
  mesaId?: string | null;
  mesaNumero: number | null;
  mesaNombre: string | null;
  createdAt: string;
}

export interface PendienteValidacionItem {
  idx: number;
  nombre: string;
  cantidad: number;
  precio: number;
  tipo: 'comida' | 'bebida';
  complementos?: string;
  nota?: string;
}

export interface PendienteValidacionPedido {
  id: string;
  createdAt: string;
  items: PendienteValidacionItem[];
  /** true = pedido ya en 'pendiente', los items mostrados son retenidos a liberar */
  validated?: boolean;
}

export interface PendienteValidacionMesa {
  mesaId: string;
  mesaNumero: number | null;
  mesaNombre: string | null;
  pedidos: PendienteValidacionPedido[];
}

export interface IPedidoRepository {
  findAllByTenant(empresaId: string): Promise<Result<Pedido[]>>;
  findAllByTenantAndMonth(empresaId: string, mes: number, año: number): Promise<Result<Pedido[]>>;
  updateStatus(id: string, empresaId: string, estado: string): Promise<Result<void>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  findById(id: string, empresaId: string): Promise<Result<Pedido | null>>;
  findByTrackingToken(token: string): Promise<Result<{ id: string; numero_pedido: number; estimated_minutes: number | null; estimated_ready_at: string | null; telegram_message_id: string | null; telegram_chat_id: string | null; tipo: string; estado: string; glovo_status: string | null; mesa_id: string | null; mesa_numero: number | null; mesa_nombre: string | null; delivery_fee_cents: number | null; items: { nombre: string; cantidad: number; precio: number }[] } | null>>;
  createMesaOrder(params: {
    empresaId: string;
    mesaId: string;
    items: { nombre: string; cantidad: number; precio: number; tipo_producto?: string; translations?: unknown; nota?: string; complementos?: { nombre: string; precio: number }[] }[];
    total: number;
    trackingToken: string;
    sesionId: string | null;
    initialEstado?: 'pendiente' | 'retenido' | 'pendiente_validacion';
  }): Promise<Result<{ id: string; numero_pedido: number; tracking_token: string }>>;
  findEstimatedReadyAtById(pedidoId: string): Promise<Result<string | null>>;
  findStatusById(pedidoId: string): Promise<Result<string | null>>;
  updateEstimatedTime(pedidoId: string, minutes: number): Promise<Result<void>>;
  updateStatusById(pedidoId: string, estado: string): Promise<Result<void>>;
  saveTelegramMessageId(pedidoId: string, messageId: number): Promise<Result<void>>;
  deleteAllByTenant(empresaId: string): Promise<Result<number>>;
  findBySesionId(sesionId: string): Promise<Result<{ id: string; numero_pedido: number; total: number; estado: string; detalle_pedido: unknown[]; created_at: string }[]>>;
  updateOrderItems(pedidoId: string, items: { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] }[], newTotal: number): Promise<Result<void>>;
  consolidateSesionOrders(sesionId: string): Promise<Result<void>>;
  create(
    empresaId: string,
    clienteId: string | null,
    items: CartItem[],
    total: number,
    discountData?: { codigoDescuentoId: string; descuentoPorcentaje: number; totalSinDescuento: number },
    trackingToken?: string,
    deliveryData?: {
      origen?: string;
      direccion_entrega?: string;
      codigo_postal?: string;
      latitude_entrega?: number;
      longitude_entrega?: number;
      estimated_delivery_fee_cents?: number;
    }
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>>;
  countKitchenBarOrders(empresaId: string): Promise<Result<KitchenBarCounts>>;
  findKitchenOrders(empresaId: string): Promise<Result<KitchenOrderItem[]>>;
  findAllRetenidos(empresaId: string, tipo: 'comida' | 'bebida'): Promise<Result<RetenidoItem[]>>;
  findBarOrders(empresaId: string): Promise<Result<BarOrderItem[]>>;
  /** Returns food items in pendiente|en_preparacion|listo|retenido (for /waiter/kitchen view) */
  findWaiterKitchenItems(empresaId: string): Promise<Result<KitchenItemRecord[]>>;
  /** Upsert a per-item kitchen estado */
  upsertItemEstado(empresaId: string, pedidoId: string, itemIdx: number, estado: ItemEstado): Promise<Result<void>>;
  findPendientesValidacion(empresaId: string): Promise<Result<PendienteValidacionMesa[]>>;
  validatePedido(empresaId: string, pedidoId: string, retainIndices: number[], pausedIndices?: number[]): Promise<Result<void>>;
  getStats(empresaId: string, mes: number, año: number): Promise<Result<{
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
  }>>;
}
