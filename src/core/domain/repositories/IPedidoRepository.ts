import { Pedido, CartItem, Result } from "../entities/types";

export interface IPedidoRepository {
  findAllByTenant(empresaId: string): Promise<Result<Pedido[]>>;
  findAllByTenantAndMonth(empresaId: string, mes: number, año: number): Promise<Result<Pedido[]>>;
  updateStatus(id: string, empresaId: string, estado: string): Promise<Result<void>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  deleteAllByTenant(empresaId: string): Promise<Result<number>>;
  create(
    empresaId: string,
    clienteId: string | null,
    items: CartItem[],
    total: number,
    discountData?: { codigoDescuentoId: string; descuentoPorcentaje: number; totalSinDescuento: number }
  ): Promise<Result<{ id: string; numero_pedido: number; total: number }>>;
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
