import { SupabaseClient } from "@supabase/supabase-js";
import { Pedido, CartItem, PedidoItem, Result } from "@/core/domain/entities/types";
import { IPedidoRepository } from "@/core/domain/repositories/IPedidoRepository";
import { logger } from "../logging/logger";

type DeliveryData = {
  origen?: string;
  direccion_entrega?: string;
  codigo_postal?: string;
  latitude_entrega?: number;
  longitude_entrega?: number;
  estimated_delivery_fee_cents?: number;
};

function applyDeliveryFields(payload: Record<string, unknown>, d: DeliveryData): void {
  if (d.origen) payload.origen = d.origen;
  if (d.direccion_entrega) payload.direccion_entrega = d.direccion_entrega;
  if (d.codigo_postal) payload.codigo_postal = d.codigo_postal;
  if (d.latitude_entrega !== undefined) payload.latitude_entrega = d.latitude_entrega;
  if (d.longitude_entrega !== undefined) payload.longitude_entrega = d.longitude_entrega;
  if (d.estimated_delivery_fee_cents !== undefined) payload.delivery_fee_cents = d.estimated_delivery_fee_cents;
}

export class SupabasePedidoRepository implements IPedidoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async getOpenSesionIds(empresaId: string): Promise<Set<string>> {
    const { data } = await this.supabase
      .from('mesa_sesiones')
      .select('id')
      .eq('empresa_id', empresaId)
      .is('cerrada_at', null);
    return new Set((data ?? []).map((s: Record<string, unknown>) => s['id'] as string));
  }

  private excludeOpenSesionPedidos(data: Pedido[], openSesionIds: Set<string>): Pedido[] {
    if (openSesionIds.size === 0) return data;
    return data.filter(p => {
      const sesionId = (p as unknown as Record<string, unknown>)['sesion_id'] as string | null;
      return !sesionId || !openSesionIds.has(sesionId);
    });
  }

  async findAllByTenant(empresaId: string): Promise<Result<Pedido[]>> {
    try {
      const [{ data, error }, openSesionIds] = await Promise.all([
        this.supabase
          .from('pedidos')
          .select(`*, clientes:cliente_id (nombre, email, telefono), mesas:mesa_id (numero, nombre)`)
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false }),
        this.getOpenSesionIds(empresaId),
      ]);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabasePedidoRepository.findAllByTenant', { empresaId, details: { code: error.code } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos', module: 'repository', method: 'findAllByTenant' } };
      }
      return { success: true, data: this.excludeOpenSesionPedidos(data || [], openSesionIds) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findAllByTenantAndMonth(empresaId: string, mes: number, año: number): Promise<Result<Pedido[]>> {
    try {
      const startDate = new Date(año, mes, 1).toISOString();
      const endDate = new Date(año, mes + 1, 0, 23, 59, 59).toISOString();

      const [{ data, error }, openSesionIds] = await Promise.all([
        this.supabase
          .from('pedidos')
          .select(`*, clientes:cliente_id (nombre, email, telefono), mesas:mesa_id (numero, nombre)`)
          .eq('empresa_id', empresaId)
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .order('created_at', { ascending: false }),
        this.getOpenSesionIds(empresaId),
      ]);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabasePedidoRepository.findAllByTenantAndMonth', { empresaId, details: { code: error.code, mes, año } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos', module: 'repository', method: 'findAllByTenantAndMonth' } };
      }
      return { success: true, data: this.excludeOpenSesionPedidos(data || [], openSesionIds) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findAllByTenantAndMonth', { empresaId, details: { mes, año } });
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

  async findById(id: string, empresaId: string): Promise<Result<Pedido | null>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select(`
          *,
          clientes:cliente_id (nombre, email, telefono),
          mesas:mesa_id (numero, nombre)
        `)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // PostgREST error for "Not a single row"
          return { success: true, data: null };
        }
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.findById',
          { empresaId, details: { code: error.code, pedidoId: id } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar pedido', module: 'repository', method: 'findById' } };
      }

      return { success: true, data: data as Pedido | null };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findById', { empresaId });
      return { success: false, error: appError };
    }
   }

  async deleteAllByTenant(empresaId: string): Promise<Result<number>> {
    try {
      const { data: pedidosAEliminar, error: countError } = await this.supabase
        .from('pedidos')
        .select('id')
        .eq('empresa_id', empresaId);

      if (countError) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          countError.message,
          'repository',
          'SupabasePedidoRepository.deleteAllByTenant (count)',
          { empresaId, details: { code: countError.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al contar pedidos', module: 'repository', method: 'deleteAllByTenant' } };
      }

      const count = pedidosAEliminar?.length || 0;

      if (count === 0) {
        return { success: true, data: 0 };
      }

      const { error: deleteError } = await this.supabase
        .from('pedidos')
        .delete()
        .eq('empresa_id', empresaId);

      if (deleteError) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          deleteError.message,
          'repository',
          'SupabasePedidoRepository.deleteAllByTenant',
          { empresaId, details: { code: deleteError.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar todos los pedidos', module: 'repository', method: 'deleteAllByTenant' } };
      }

      return { success: true, data: count };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.deleteAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(
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
  ): Promise<Result<{ id: string; numero_pedido: number; total: number; trackingToken?: string }>> {
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
          translations: ci.item?.translations,
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

      if (trackingToken) {
        insertPayload.tracking_token = trackingToken;
      }

      if (deliveryData) applyDeliveryFields(insertPayload, deliveryData);

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
      return { success: true, data: { id: pedido.id, numero_pedido: pedido.numero_pedido, total: pedido.total, trackingToken } };
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
    byOrigen: {
      mesa:     { pedidos: number; total: number };
      recogida: { pedidos: number; total: number };
      web:      { pedidos: number; total: number };
    };
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
        dia: Number.parseInt(dia),
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

      // Origin breakdown for the selected month
      const mesaPedidos    = pedidosMes.filter(p => p.mesa_id);
      const recogidaPedidos = pedidosMes.filter(p => !p.mesa_id && p.tracking_token);
      const webPedidos     = pedidosMes.filter(p => !p.mesa_id && !p.tracking_token);

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
          byOrigen: {
            mesa:     { pedidos: mesaPedidos.length,    total: mesaPedidos.reduce((s, p) => s + (p.total || 0), 0) },
            recogida: { pedidos: recogidaPedidos.length, total: recogidaPedidos.reduce((s, p) => s + (p.total || 0), 0) },
            web:      { pedidos: webPedidos.length,      total: webPedidos.reduce((s, p) => s + (p.total || 0), 0) },
          },
        }
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.getStats', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findByTrackingToken(
    token: string
  ): Promise<Result<{ id: string; numero_pedido: number; estimated_minutes: number | null; estimated_ready_at: string | null; telegram_message_id: string | null; telegram_chat_id: string | null; tipo: string; estado: string; glovo_status: string | null; mesa_id: string | null; mesa_numero: number | null; mesa_nombre: string | null; delivery_fee_cents: number | null; items: { nombre: string; translations?: { en?: { name: string }; fr?: { name: string }; it?: { name: string }; de?: { name: string } }; cantidad: number; precio: number }[] } | null>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('id, numero_pedido, estimated_minutes, estimated_ready_at, telegram_message_id, detalle_pedido, estado, glovo_status, mesa_id, delivery_fee_cents, mesas(numero, nombre), empresas(telegram_chat_id, tipo)')
        .eq('tracking_token', token)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.findByTrackingToken',
          { details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar pedido', module: 'repository', method: 'findByTrackingToken' } };
      }

      if (!data) return { success: true, data: null };

      const raw = data as unknown as Record<string, unknown>;
      const empresa = Array.isArray(raw['empresas'])
        ? (raw['empresas'][0] as Record<string, unknown> | undefined)
        : (raw['empresas'] as Record<string, unknown> | null);

      const mesaRaw = Array.isArray(raw['mesas'])
        ? (raw['mesas'][0] as Record<string, unknown> | undefined)
        : (raw['mesas'] as Record<string, unknown> | null);

      const mesaId = (raw['mesa_id'] as string | null) ?? null;
      const tipo = mesaId ? 'mesa' : ((empresa?.['tipo'] as string) ?? 'tienda');

      return {
        success: true,
        data: {
          id: raw['id'] as string,
          numero_pedido: raw['numero_pedido'] as number,
          estimated_minutes: (raw['estimated_minutes'] as number | null) ?? null,
          estimated_ready_at: (raw['estimated_ready_at'] as string | null) ?? null,
          telegram_message_id: (raw['telegram_message_id'] as string | null) ?? null,
          telegram_chat_id: (empresa?.['telegram_chat_id'] as string | null) ?? null,
          tipo,
          estado: (raw['estado'] as string) ?? 'pendiente',
          glovo_status: (raw['glovo_status'] as string | null) ?? null,
          mesa_id: mesaId,
          mesa_numero: (mesaRaw?.['numero'] as number | null) ?? null,
          mesa_nombre: (mesaRaw?.['nombre'] as string | null) ?? null,
          delivery_fee_cents: (raw['delivery_fee_cents'] as number | null) ?? null,
          items: ((raw['detalle_pedido'] as { nombre: string; translations?: { en?: { name: string }; fr?: { name: string }; it?: { name: string }; de?: { name: string } }; cantidad: number; precio: number }[] | null) ?? []),
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findByTrackingToken');
      return { success: false, error: appError };
    }
  }

  async createMesaOrder(params: {
    empresaId: string;
    mesaId: string;
    items: { nombre: string; cantidad: number; precio: number; translations?: unknown; complementos?: { nombre: string; precio: number }[] }[];
    total: number;
    trackingToken: string;
    sesionId: string | null;
  }): Promise<Result<{ id: string; numero_pedido: number; tracking_token: string }>> {
    try {
      const { data: nextNum, error: rpcError } = await this.supabase
        .rpc('get_next_pedido_number', { p_empresa_id: params.empresaId });

      if (rpcError) {
        await logger.logAndReturnError(
          'DB_RPC_ERROR',
          rpcError.message,
          'repository',
          'SupabasePedidoRepository.createMesaOrder',
          { empresaId: params.empresaId, details: { code: rpcError.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al generar número de pedido', module: 'repository', method: 'createMesaOrder' } };
      }

      const nuevoNumeroPedido = nextNum as number;

      const insertPayload: Record<string, unknown> = {
        empresa_id: params.empresaId,
        mesa_id: params.mesaId,
        numero_pedido: nuevoNumeroPedido,
        cliente_id: null,
        detalle_pedido: params.items.map(item => ({
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio: item.precio,
          translations: item.translations ?? null,
          complementos: item.complementos ?? [],
        })),
        total: params.total,
        estado: 'pendiente',
        tracking_token: params.trackingToken,
        sesion_id: params.sesionId,
      };

      const { data: pedido, error } = await this.supabase
        .from('pedidos')
        .insert(insertPayload)
        .select('id, numero_pedido, tracking_token')
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.createMesaOrder',
          { empresaId: params.empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear pedido de mesa', module: 'repository', method: 'createMesaOrder' } };
      }

      const row = pedido as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          numero_pedido: row['numero_pedido'] as number,
          tracking_token: row['tracking_token'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.createMesaOrder', { empresaId: params.empresaId });
      return { success: false, error: appError };
    }
  }

  async saveTelegramMessageId(pedidoId: string, messageId: number): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('pedidos')
        .update({ telegram_message_id: String(messageId) })
        .eq('id', pedidoId);

      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', 'SupabasePedidoRepository.saveTelegramMessageId', { details: { code: error.code, pedidoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al guardar message_id', module: 'repository', method: 'saveTelegramMessageId' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.saveTelegramMessageId', { details: { pedidoId } });
      return { success: false, error: appError };
    }
  }

  async findReadyPedidosWithTelegramMessage(): Promise<Result<{ id: string; telegram_message_id: string; telegram_chat_id: string }[]>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('id, telegram_message_id, empresas!inner(telegram_chat_id)')
        .not('telegram_message_id', 'is', null)
        .lte('estimated_ready_at', new Date().toISOString());

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabasePedidoRepository.findReadyPedidosWithTelegramMessage', { details: { code: error.code } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar pedidos listos', module: 'repository', method: 'findReadyPedidosWithTelegramMessage' } };
      }

      const rows = (data ?? []).map((row: Record<string, unknown>) => {
        const empresa = row['empresas'] as Record<string, unknown> | null;
        return {
          id: row['id'] as string,
          telegram_message_id: row['telegram_message_id'] as string,
          telegram_chat_id: (empresa?.['telegram_chat_id'] ?? '') as string,
        };
      }).filter(r => r.telegram_chat_id);

      return { success: true, data: rows };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findReadyPedidosWithTelegramMessage');
      return { success: false, error: appError };
    }
  }

  async clearTelegramMessageId(pedidoId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('pedidos')
        .update({ telegram_message_id: null })
        .eq('id', pedidoId);

      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', 'SupabasePedidoRepository.clearTelegramMessageId', { details: { code: error.code, pedidoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al limpiar message_id', module: 'repository', method: 'clearTelegramMessageId' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.clearTelegramMessageId', { details: { pedidoId } });
      return { success: false, error: appError };
    }
  }

  async findEstimatedReadyAtById(pedidoId: string): Promise<Result<string | null>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('estimated_ready_at')
        .eq('id', pedidoId)
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'DB_ERROR', message: error.message, module: 'repository', method: 'findEstimatedReadyAtById' } };
      }
      return { success: true, data: (data as { estimated_ready_at: string | null } | null)?.estimated_ready_at ?? null };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findEstimatedReadyAtById');
      return { success: false, error: appError };
    }
  }

  async updateStatusById(pedidoId: string, estado: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('pedidos')
        .update({ estado })
        .eq('id', pedidoId);

      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', 'SupabasePedidoRepository.updateStatusById', { details: { code: error.code, pedidoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar estado', module: 'repository', method: 'updateStatusById' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.updateStatusById', { details: { pedidoId } });
      return { success: false, error: appError };
    }
  }

  async updateEstimatedTime(pedidoId: string, minutes: number): Promise<Result<void>> {
    try {
      const estimatedReadyAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

      const { error } = await this.supabase
        .from('pedidos')
        .update({ estimated_minutes: minutes, estimated_ready_at: estimatedReadyAt })
        .eq('id', pedidoId);

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.updateEstimatedTime',
          { details: { code: error.code, pedidoId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar tiempo estimado', module: 'repository', method: 'updateEstimatedTime' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.updateEstimatedTime', { details: { pedidoId } });
      return { success: false, error: appError };
    }
  }

  async findBySesionId(sesionId: string): Promise<Result<{ id: string; numero_pedido: number; total: number; estado: string; detalle_pedido: unknown[]; created_at: string }[]>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('id, numero_pedido, total, estado, detalle_pedido, created_at')
        .eq('sesion_id', sesionId)
        .order('created_at', { ascending: true });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.findBySesionId',
          { details: { code: error.code, sesionId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos de sesión', module: 'repository', method: 'findBySesionId' } };
      }

      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        success: true,
        data: rows.map(row => ({
          id: row['id'] as string,
          numero_pedido: row['numero_pedido'] as number,
          total: row['total'] as number,
          estado: row['estado'] as string,
          detalle_pedido: (row['detalle_pedido'] as unknown[]) ?? [],
          created_at: row['created_at'] as string,
        })),
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findBySesionId', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }

  async consolidateSesionOrders(sesionId: string): Promise<Result<void>> {
    try {
      const ordersResult = await this.findBySesionId(sesionId);
      if (!ordersResult.success) return { success: false, error: ordersResult.error };

      const orders = ordersResult.data;
      if (orders.length === 0) return { success: true, data: undefined };

      if (orders.length === 1) {
        await this.supabase.from('pedidos').update({ estado: 'cerrado' }).eq('id', orders[0].id);
        return { success: true, data: undefined };
      }

      const mergedItems = orders.flatMap(o => o.detalle_pedido);
      const mergedTotal = orders.reduce((sum, o) => sum + Number(o.total), 0);
      const [primary, ...rest] = orders;

      const { error: updateError } = await this.supabase
        .from('pedidos')
        .update({ detalle_pedido: mergedItems, total: Math.round(mergedTotal * 100) / 100, estado: 'cerrado' })
        .eq('id', primary.id);

      if (updateError) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          updateError.message,
          'repository',
          'SupabasePedidoRepository.consolidateSesionOrders',
          { details: { code: updateError.code, sesionId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al consolidar pedidos', module: 'repository', method: 'consolidateSesionOrders' } };
      }

      const restIds = rest.map(o => o.id);
      const { error: deleteError } = await this.supabase
        .from('pedidos')
        .delete()
        .in('id', restIds);

      if (deleteError) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          deleteError.message,
          'repository',
          'SupabasePedidoRepository.consolidateSesionOrders',
          { details: { code: deleteError.code, sesionId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar pedidos duplicados', module: 'repository', method: 'consolidateSesionOrders' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.consolidateSesionOrders', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }

  async findSesionTelegramMessages(sesionId: string): Promise<Result<{ messageId: number; chatId: string }[]>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('telegram_message_id, empresas(telegram_mesa_chat_id, telegram_chat_id)')
        .eq('sesion_id', sesionId)
        .not('telegram_message_id', 'is', null);

      if (error) {
        return { success: false, error: { code: 'DB_ERROR', message: error.message, module: 'repository', method: 'findSesionTelegramMessages' } };
      }

      const messages = (data ?? []).flatMap((row) => {
        const empRaw = Array.isArray(row['empresas'])
          ? (row['empresas'][0] as Record<string, unknown> | undefined) ?? null
          : (row['empresas'] as Record<string, unknown> | null);
        const chatId = (empRaw?.['telegram_mesa_chat_id'] as string | null)
          ?? (empRaw?.['telegram_chat_id'] as string | null)
          ?? null;
        const messageId = Number(row['telegram_message_id']);
        return chatId && messageId ? [{ messageId, chatId }] : [];
      });

      return { success: true, data: messages };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findSesionTelegramMessages', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }
  async findMesaContextForWebhook(pedidoId: string): Promise<Result<{ empresa_id: string; numero_pedido: number; mesa_numero: number; mesa_nombre: string | null; telegram_bebidas_chat_id: string | null } | null>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('empresa_id, numero_pedido, mesas(numero, nombre), empresas(telegram_bebidas_chat_id)')
        .eq('id', pedidoId)
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'DB_ERROR', message: error.message, module: 'repository', method: 'findMesaContextForWebhook' } };
      }

      if (!data) return { success: true, data: null };

      const mesaRaw = Array.isArray(data['mesas'])
        ? (data['mesas'][0] ?? null)
        : (data['mesas'] ?? null);

      const empRaw = Array.isArray(data['empresas'])
        ? (data['empresas'][0] ?? null)
        : (data['empresas'] ?? null);

      return {
        success: true,
        data: {
          empresa_id: data['empresa_id'] as string,
          numero_pedido: data['numero_pedido'] as number,
          mesa_numero: ((mesaRaw as Record<string, unknown> | null)?.['numero'] as number) ?? 0,
          mesa_nombre: ((mesaRaw as Record<string, unknown> | null)?.['nombre'] as string | null) ?? null,
          telegram_bebidas_chat_id: ((empRaw as Record<string, unknown> | null)?.['telegram_bebidas_chat_id'] as string | null) ?? null,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findMesaContextForWebhook', { details: { pedidoId } });
      return { success: false, error: appError };
    }
  }
}