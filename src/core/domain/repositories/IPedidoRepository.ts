import { Pedido, CartItem, Result } from "../entities/types";

export interface IPedidoRepository {
  findAllByTenant(empresaId: string): Promise<Result<Pedido[]>>;
  findAllByTenantAndMonth(empresaId: string, mes: number, año: number): Promise<Result<Pedido[]>>;
  updateStatus(id: string, empresaId: string, estado: string): Promise<Result<void>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  findById(id: string, empresaId: string): Promise<Result<Pedido | null>>;
  findByTrackingToken(token: string): Promise<Result<{ id: string; numero_pedido: number; estimated_minutes: number | null; estimated_ready_at: string | null; telegram_message_id: string | null; telegram_chat_id: string | null; tipo: string; estado: string; mesa_id: string | null; mesa_numero: number | null; mesa_nombre: string | null; items: { nombre: string; cantidad: number; precio: number }[] } | null>>;
  createMesaOrder(params: {
    empresaId: string;
    mesaId: string;
    items: { nombre: string; cantidad: number; precio: number; translations?: unknown }[];
    total: number;
    trackingToken: string;
    sesionId: string | null;
  }): Promise<Result<{ id: string; numero_pedido: number; tracking_token: string }>>;
  findEstimatedReadyAtById(pedidoId: string): Promise<Result<string | null>>;
  updateEstimatedTime(pedidoId: string, minutes: number): Promise<Result<void>>;
  updateStatusById(pedidoId: string, estado: string): Promise<Result<void>>;
  saveTelegramMessageId(pedidoId: string, messageId: number): Promise<Result<void>>;
  findReadyPedidosWithTelegramMessage(): Promise<Result<{ id: string; telegram_message_id: string; telegram_chat_id: string }[]>>;
  clearTelegramMessageId(pedidoId: string): Promise<Result<void>>;
  deleteAllByTenant(empresaId: string): Promise<Result<number>>;
  findBySesionId(sesionId: string): Promise<Result<{ id: string; numero_pedido: number; total: number; estado: string; detalle_pedido: unknown[]; created_at: string }[]>>;
  create(
    empresaId: string,
    clienteId: string | null,
    items: CartItem[],
    total: number,
    discountData?: { codigoDescuentoId: string; descuentoPorcentaje: number; totalSinDescuento: number },
    trackingToken?: string
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>>;
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
