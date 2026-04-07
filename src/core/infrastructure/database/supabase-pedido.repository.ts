import { SupabaseClient } from "@supabase/supabase-js";
import { Pedido, CartItem, PedidoItem, Result } from "@/core/domain/entities/types";
import { IPedidoRepository } from "@/core/domain/repositories/IPedidoRepository";
import { logger } from "../logging/logger";

export class SupabasePedidoRepository implements IPedidoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Result<Pedido[]>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select(`
          *,
          clientes:cliente_id (nombre, email, telefono)
        `)
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.findAllByTenant',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos', module: 'repository', method: 'findAllByTenant' } };
      }
      return { success: true, data: data || [] };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async updateStatus(id: string, empresaId: string, estado: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('pedidos')
        .update({ estado })
        .eq("id", id)
        .eq("empresa_id", empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.updateStatus',
          { empresaId, details: { code: error.code, pedidoId: id } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar estado', module: 'repository', method: 'updateStatus' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.updateStatus', { empresaId });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('pedidos')
        .delete()
        .eq("id", id)
        .eq("empresa_id", empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.delete',
          { empresaId, details: { code: error.code, pedidoId: id } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar pedido', module: 'repository', method: 'delete' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.delete', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(
    empresaId: string,
    clienteId: string | null,
    items: CartItem[],
    total: number,
    discountData?: { codigoDescuentoId: string; descuentoPorcentaje: number; totalSinDescuento: number }
  ): Promise<Result<{ id: string; numero_pedido: number; total: number }>> {
    try {
      // Atomically generate next order number using a DB function with row-level lock
      const { data: nextNum, error: rpcError } = await this.supabase
        .rpc('get_next_pedido_number', { p_empresa_id: empresaId });

      if (rpcError) {
        await logger.logAndReturnError(
          'DB_RPC_ERROR',
          rpcError.message,
          'repository',
          'SupabasePedidoRepository.create',
          { empresaId, details: { code: rpcError.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al generar número de pedido', module: 'repository', method: 'create' } };
      }

      const nuevoNumeroPedido = nextNum as number;

      const insertPayload: Record<string, unknown> = {
        empresa_id: empresaId,
        numero_pedido: nuevoNumeroPedido,
        cliente_id: clienteId,
        detalle_pedido: items.map(ci => ({
          producto_id: ci.item?.id,
          nombre: ci.item?.name,
          precio: ci.item?.price,
          cantidad: ci.quantity,
          complementos: ci.selectedComplements || [],
        })),
        total: total,
        estado: 'pendiente',
      };

      if (discountData) {
        insertPayload.codigo_descuento_id = discountData.codigoDescuentoId;
        insertPayload.descuento_porcentaje = discountData.descuentoPorcentaje;
        insertPayload.total_sin_descuento = discountData.totalSinDescuento;
      }

      const { data: pedido, error } = await this.supabase
        .from('pedidos')
        .insert(insertPayload)
        .select('id, numero_pedido, total')
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.create',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear pedido', module: 'repository', method: 'create' } };
      }
      return { success: true, data: { id: pedido.id, numero_pedido: pedido.numero_pedido, total: pedido.total } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.create', { empresaId });
      return { success: false, error: appError };
    }
  }

  async getStats(empresaId: string, mes: number, año: number): Promise<Result<{
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
  }>> {
    try {
      const now = new Date();
      const todayStart = new Date(año, mes, now.getDate()).toISOString();
      const monthStart = new Date(año, mes, 1).toISOString();
      const monthEnd = new Date(año, mes + 1, 0, 23, 59, 59).toISOString();
      const yearStart = new Date(año, 0, 1).toISOString();

      // Previous month calculations
      const mesAnterior = mes === 0 ? 11 : mes - 1;
      const añoAnterior = mes === 0 ? año - 1 : año;
      const mesAnteriorStart = new Date(añoAnterior, mesAnterior, 1).toISOString();
      const mesAnteriorEnd = new Date(añoAnterior, mesAnterior + 1, 0, 23, 59, 59).toISOString();

      const { data: pedidos, error } = await this.supabase
        .from('pedidos')
        .select('*, clientes!inner(*)')
        .eq('empresa_id', empresaId)
        .gte('created_at', yearStart);

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.getStats',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener estadísticas', module: 'repository', method: 'getStats' } };
      }

      const pedidosFiltrados = pedidos || [];

      const pedidosHoy = pedidosFiltrados.filter(p => {
        const fecha = new Date(p.created_at);
        return fecha >= new Date(todayStart) && fecha <= new Date(monthEnd);
      });
      const pedidosMes = pedidosFiltrados.filter(p => new Date(p.created_at) >= new Date(monthStart) && new Date(p.created_at) <= new Date(monthEnd));
      const pedidosAnterior = pedidosFiltrados.filter(p => {
        const fecha = new Date(p.created_at);
        return fecha >= new Date(mesAnteriorStart) && fecha <= new Date(mesAnteriorEnd);
      });

      const totalHoy = pedidosHoy.reduce((sum, p) => sum + (p.total || 0), 0);
      const totalMes = pedidosMes.reduce((sum, p) => sum + (p.total || 0), 0);
      const totalAno = pedidosFiltrados.reduce((sum, p) => sum + (p.total || 0), 0);
      const ingresosAnterior = pedidosAnterior.reduce((sum, p) => sum + (p.total || 0), 0);

      // Build orders by day
      const pedidosPorDiaMap: Record<number, { pedidos: number; ingresos: number }> = {};
      const daysInMonth = new Date(año, mes + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        pedidosPorDiaMap[d] = { pedidos: 0, ingresos: 0 };
      }
      pedidosMes.forEach(p => {
        const dia = new Date(p.created_at).getDate();
        if (pedidosPorDiaMap[dia]) {
          pedidosPorDiaMap[dia].pedidos++;
          pedidosPorDiaMap[dia].ingresos += p.total || 0;
        }
      });
      const pedidosPorDia = Object.entries(pedidosPorDiaMap).map(([dia, data]) => ({
        dia: parseInt(dia),
        pedidos: data.pedidos,
        ingresos: data.ingresos
      }));

      // Client stats - track unique clients
      const clientesSet = new Set<string>();
      pedidosMes.forEach(p => {
        if (p.cliente_id) clientesSet.add(p.cliente_id);
      });
      const clientesNuevos = clientesSet.size;
      const clientesRecurrentes = 0; // Would need historical data to calculate

      // Ticket medio
      const ticketMedio = pedidosMes.length > 0 ? totalMes / pedidosMes.length : 0;
      const ticketMedioAnterior = pedidosAnterior.length > 0 ? ingresosAnterior / pedidosAnterior.length : 0;

      const buildTopPlatos = (pedidosList: typeof pedidosFiltrados) => {
        const dishCount: Record<string, { nombre: string; cantidad: number; total: number }> = {};
        pedidosList.forEach(pedido => {
          if (pedido.detalle_pedido) {
            pedido.detalle_pedido.forEach((item: PedidoItem) => {
              const key = String(item.nombre);
              if (!dishCount[key]) {
                dishCount[key] = { nombre: key, cantidad: 0, total: 0 };
              }
              dishCount[key].cantidad += Number(item.cantidad) || 1;
              dishCount[key].total += (Number(item.precio) * (Number(item.cantidad) || 1));
            });
          }
        });
        return Object.values(dishCount).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
      };

      return {
        success: true,
        data: {
          pedidosHoy: pedidosHoy.length,
          pedidosMes: pedidosMes.length,
          totalHoy,
          totalMes,
          totalAno,
          topPlatos: buildTopPlatos(pedidosMes),
          topPlatosAno: buildTopPlatos(pedidosFiltrados),
          pedidosPorDia,
          clientesNuevos,
          clientesRecurrentes,
          ticketMedio,
          ticketMedioAnterior,
          pedidosAnterior: pedidosAnterior.length,
          ingresosAnterior,
        }
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.getStats', { empresaId });
      return { success: false, error: appError };
    }
  }
}
