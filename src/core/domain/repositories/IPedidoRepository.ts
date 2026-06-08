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
  mesaNumero: number | null;
  mesaNombre: string | null;
  sesionCreatedAt: string;
}

export interface BarOrderItem {
  id: string;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  items: { nombre: string; cantidad: number }[];
  estado: string;
  createdAt: string;
  sesionId: string | null;
  /**
   * bebida        — pure drink order, swipeable → servido
   * bebida-info   — drinks inside a mixed order (comida still being cooked), informational only
   * kitchen-alert — comida is preparado, waiter must pick up food (+ drinks if any), swipeable → servido
   */
  tipo: 'bebida' | 'bebida-info' | 'kitchen-alert';
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
    items: { nombre: string; cantidad: number; precio: number; tipo_producto?: string; translations?: unknown }[];
    total: number;
    trackingToken: string;
    sesionId: string | null;
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
  getStats(empresaId: string, mes: number, año: number): Promise<Result<{
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
  }>>;
}
