import { Pedido, CartItem } from "../entities/types";

export interface IPedidoRepository {
  findAllByTenant(empresaId: string): Promise<Pedido[]>;
  updateStatus(id: string, empresaId: string, estado: string): Promise<void>;
  delete(id: string, empresaId: string): Promise<void>;
  create(empresaId: string, clienteId: string | null, items: CartItem[], total: number): Promise<{ id: string; numero_pedido: number }>;
  getStats(empresaId: string, mes: number, año: number): Promise<{
    pedidosHoy: number;
    pedidosMes: number;
    totalHoy: number;
    totalMes: number;
    totalAno: number;
    topPlatos: { nombre: string; cantidad: number; total: number }[];
    topPlatosAno: { nombre: string; cantidad: number; total: number }[];
  }>;
}
