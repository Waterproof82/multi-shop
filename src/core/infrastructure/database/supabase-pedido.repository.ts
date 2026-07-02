import { SupabaseClient } from "@supabase/supabase-js";
import { Pedido, CartItem, PedidoItem, Result } from "@/core/domain/entities/types";
import { IPedidoRepository, KitchenBarCounts, KitchenOrderItem, BarOrderItem, RetenidoItem, KitchenItemRecord, ItemEstado, PendienteValidacionMesa, PendienteValidacionItem } from "@/core/domain/repositories/IPedidoRepository";
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

// ── findPendientesValidacion helpers ──────────────────────────────────────────

function mapPendienteItem(item: Record<string, unknown>, idx: number): PendienteValidacionItem {
  return {
    idx,
    nombre: item['nombre'] as string,
    cantidad: item['cantidad'] as number,
    precio: item['precio'] as number,
    tipo: ((item['tipo_producto'] as string | undefined) ?? 'comida') as 'comida' | 'bebida',
    complementos: (item['complementos'] as Array<{ nombre?: string }> | undefined)
      ?.map(c => c.nombre ?? '').filter(Boolean).join(', '),
    nota: (item['nota'] as string | undefined) || undefined,
  };
}

function buildIndexSetMap(rows: Array<Record<string, unknown>>): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const r of rows) {
    const pid = r['pedido_id'] as string;
    const idx = r['item_idx'] as number;
    if (!map.has(pid)) map.set(pid, new Set());
    map.get(pid)!.add(idx);
  }
  return map;
}

function buildPendientesMesaMap(pedidos: Array<Record<string, unknown>>): Map<string, PendienteValidacionMesa> {
  const mesaMap = new Map<string, PendienteValidacionMesa>();
  for (const row of pedidos) {
    const mesaData = row['mesas'] as Record<string, unknown> ?? {};
    const mesaId = row['mesa_id'] as string;
    const detalle = (row['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
    if (!mesaMap.has(mesaId)) {
      mesaMap.set(mesaId, {
        mesaId,
        mesaNumero: (mesaData['numero'] as number) ?? null,
        mesaNombre: (mesaData['nombre'] as string | null) ?? null,
        pedidos: [],
      });
    }
    mesaMap.get(mesaId)!.pedidos.push({
      id: row['id'] as string,
      createdAt: row['created_at'] as string,
      items: detalle.map((item, idx) => mapPendienteItem(item, idx)),
    });
  }
  return mesaMap;
}

function applyCancelados(
  mesaMap: Map<string, PendienteValidacionMesa>,
  canceladoMap: Map<string, Set<number>>
): void {
  for (const mesa of mesaMap.values()) {
    mesa.pedidos = mesa.pedidos
      .map(p => ({ ...p, items: p.items.filter(i => !canceladoMap.get(p.id)?.has(i.idx)) }))
      .filter(p => p.items.length > 0);
  }
  for (const [key, mesa] of mesaMap.entries()) {
    if (mesa.pedidos.length === 0) mesaMap.delete(key);
  }
}

function addValidatedRetenidos(
  mesaMap: Map<string, PendienteValidacionMesa>,
  validatedPedidos: Array<Record<string, unknown>>,
  retenidoMap: Map<string, Set<number>>
): void {
  for (const row of validatedPedidos) {
    const mesaData = row['mesas'] as Record<string, unknown> ?? {};
    const mesaId = row['mesa_id'] as string;
    const pedidoId = row['id'] as string;
    const detalle = (row['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
    const retenidoIndices = retenidoMap.get(pedidoId) ?? new Set<number>();
    const items = detalle
      .map((item, idx) => mapPendienteItem(item, idx))
      .filter(item => retenidoIndices.has(item.idx));
    if (items.length === 0) continue;
    if (!mesaMap.has(mesaId)) {
      mesaMap.set(mesaId, {
        mesaId,
        mesaNumero: (mesaData['numero'] as number) ?? null,
        mesaNombre: (mesaData['nombre'] as string | null) ?? null,
        pedidos: [],
      });
    }
    mesaMap.get(mesaId)!.pedidos.push({
      id: pedidoId,
      createdAt: row['created_at'] as string,
      items,
      validated: true,
    });
  }
}

const PEDIDO_ADMIN_SELECT = '*, clientes:cliente_id (nombre, email, telefono), mesas:mesa_id (numero, nombre), sesion:sesion_id (cerrada_at)';

function pedidoEffectiveDateMs(p: Record<string, unknown>): number {
  const sesion = p['sesion'] as Record<string, unknown> | null;
  const d = (sesion?.['cerrada_at'] as string | null) ?? (p['created_at'] as string);
  return new Date(d).getTime();
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
          .select(PEDIDO_ADMIN_SELECT)
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

      // For mesa orders, effective date = session cerrada_at. Fetch closed sessions in range first.
      const { data: sesiones, error: sesionesErr } = await this.supabase
        .from('mesa_sesiones')
        .select('id')
        .eq('empresa_id', empresaId)
        .gte('cerrada_at', startDate)
        .lte('cerrada_at', endDate);

      if (sesionesErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', sesionesErr.message, 'repository', 'SupabasePedidoRepository.findAllByTenantAndMonth', { empresaId, details: { code: sesionesErr.code, mes, año } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos', module: 'repository', method: 'findAllByTenantAndMonth' } };
      }

      const sesionIds = (sesiones ?? []).map(s => (s as Record<string, unknown>)['id'] as string);

      // Non-mesa orders: filter by created_at
      const { data: nonMesa, error: nonMesaErr } = await this.supabase
        .from('pedidos')
        .select(PEDIDO_ADMIN_SELECT)
        .eq('empresa_id', empresaId)
        .is('sesion_id', null)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (nonMesaErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', nonMesaErr.message, 'repository', 'SupabasePedidoRepository.findAllByTenantAndMonth', { empresaId, details: { code: nonMesaErr.code } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos', module: 'repository', method: 'findAllByTenantAndMonth' } };
      }

      // Mesa orders: filter by their session's cerrada_at
      let mesa: Pedido[] = [];
      if (sesionIds.length > 0) {
        const { data: mesaData, error: mesaErr } = await this.supabase
          .from('pedidos')
          .select(PEDIDO_ADMIN_SELECT)
          .eq('empresa_id', empresaId)
          .in('sesion_id', sesionIds)
          .order('created_at', { ascending: false });

        if (mesaErr) {
          await logger.logAndReturnError('DB_SELECT_ERROR', mesaErr.message, 'repository', 'SupabasePedidoRepository.findAllByTenantAndMonth', { empresaId, details: { code: mesaErr.code } });
          return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos', module: 'repository', method: 'findAllByTenantAndMonth' } };
        }

        mesa = (mesaData ?? []) as Pedido[];
      }

      const rows = [...(nonMesa ?? []) as Pedido[], ...mesa] as unknown as Record<string, unknown>[];
      rows.sort((a, b) => pedidoEffectiveDateMs(b) - pedidoEffectiveDateMs(a));

      return { success: true, data: rows as unknown as Pedido[] };
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
          ...(ci.note ? { nota: ci.note } : {}),
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
  ): Promise<Result<{ id: string; numero_pedido: number; estimated_minutes: number | null; estimated_ready_at: string | null; telegram_message_id: string | null; telegram_chat_id: string | null; tipo: string; estado: string; glovo_status: string | null; mesa_id: string | null; mesa_numero: number | null; mesa_nombre: string | null; delivery_fee_cents: number | null; payment_status: string | null; items: { nombre: string; translations?: { en?: { name: string }; fr?: { name: string }; it?: { name: string }; de?: { name: string } }; cantidad: number; precio: number }[] } | null>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('id, numero_pedido, estimated_minutes, estimated_ready_at, telegram_message_id, detalle_pedido, estado, payment_status, glovo_status, mesa_id, delivery_fee_cents, mesas(numero, nombre), empresas(telegram_chat_id, tipo)')
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
          payment_status: (raw['payment_status'] as string | null) ?? null,
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
    items: { nombre: string; cantidad: number; precio: number; tipo_producto?: string; translations?: unknown; complementos?: { nombre: string; precio: number }[]; nota?: string }[];
    total: number;
    trackingToken: string;
    sesionId: string | null;
    initialEstado?: 'pendiente' | 'retenido' | 'pendiente_validacion';
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
          tipo_producto: item.tipo_producto ?? 'comida',
          translations: item.translations ?? null,
          complementos: item.complementos ?? [],
          ...(item.nota ? { nota: item.nota } : {}),
        })),
        total: params.total,
        estado: params.initialEstado ?? 'pendiente',
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

  async findStatusById(pedidoId: string): Promise<Result<string | null>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('estado')
        .eq('id', pedidoId)
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'DB_ERROR', message: error.message, module: 'repository', method: 'findStatusById' } };
      }
      return { success: true, data: (data as { estado: string } | null)?.estado ?? null };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findStatusById');
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

  async updateOrderItems(
    pedidoId: string,
    items: { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] }[],
    newTotal: number
  ): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('pedidos')
        .update({ detalle_pedido: items, total: Math.round(newTotal * 100) / 100 })
        .eq('id', pedidoId);

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabasePedidoRepository.updateOrderItems',
          { details: { code: error.code, pedidoId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: error.message, module: 'repository', method: 'updateOrderItems' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.updateOrderItems', { details: { pedidoId } });
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

  /**
   * Returns live badge counts for the waiter banner (cocina + bebidas).
   *
   * Bebidas total = bebida items in pendiente orders that have NOT yet been
   * marked `servido` in pedido_item_estados. This query is per-item (not per-order)
   * so partial serving (e.g. 1 of 2 drinks) is reflected correctly.
   *
   * Mixed orders (comida + bebida) are counted here for bebidas even though
   * the parent pedido.estado remains `pendiente`; the bar page is responsible
   * for PATCHing it to `anotado` once all bebidas are served.
   */
  private tallyCocinaItems(items: KitchenItemRecord[]): { total: number; listos: number; retenidos: number } {
    let total = 0;
    let listos = 0;
    let retenidos = 0;
    for (const item of items) {
      if (item.estado === 'pendiente' || item.estado === 'en_preparacion') total++;
      else if (item.estado === 'listo')    listos++;
      else if (item.estado === 'retenido') retenidos++;
    }
    return { total, listos, retenidos };
  }

  private async countBebidasTotal(sessionIds: string[]): Promise<Result<number>> {
    const { data: pedidos, error: pedidosError } = await this.supabase
      .from('pedidos')
      .select('id, detalle_pedido, estado')
      .in('sesion_id', sessionIds)
      .eq('estado', 'pendiente');

    if (pedidosError) {
      await logger.logAndReturnError('DB_SELECT_ERROR', pedidosError.message, 'repository', 'SupabasePedidoRepository.countBebidasTotal', { details: { code: pedidosError.code } });
      return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos', module: 'repository', method: 'countBebidasTotal' } };
    }

    const pedidoRows = (pedidos ?? []) as Record<string, unknown>[];
    const pedidoIdsWithBebida = pedidoRows
      .filter(row => (row['detalle_pedido'] as Array<Record<string, unknown>>).some(i => i['tipo_producto'] === 'bebida'))
      .map(row => row['id'] as string);

    const estadoMap = new Map<string, Map<number, string>>();
    const fromValidationSet = new Set<string>(); // "pedidoId:itemIdx" — back in pendientes queue
    if (pedidoIdsWithBebida.length > 0) {
      const { data: itemEstados } = await this.supabase
        .from('pedido_item_estados')
        .select('pedido_id, item_idx, estado, from_validation')
        .in('pedido_id', pedidoIdsWithBebida);

      for (const row of itemEstados ?? []) {
        const r = row as Record<string, unknown>;
        const pid = r['pedido_id'] as string;
        const idx = r['item_idx'] as number;
        if (r['from_validation'] === true) { fromValidationSet.add(`${pid}:${idx}`); continue; }
        if (!estadoMap.has(pid)) estadoMap.set(pid, new Map());
        estadoMap.get(pid)!.set(idx, r['estado'] as string);
      }
    }

    let total = 0;
    for (const pedido of pedidoRows) {
      const items = (pedido['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
      const pedidoId = pedido['id'] as string;
      const pedidoEstados = estadoMap.get(pedidoId) ?? new Map();
      items.forEach((item, idx) => {
        if (
          item['tipo_producto'] === 'bebida' &&
          !fromValidationSet.has(`${pedidoId}:${idx}`) &&
          pedidoEstados.get(idx) !== 'servido' &&
          pedidoEstados.get(idx) !== 'cancelado'
        ) total++;
      });
    }
    return { success: true, data: total };
  }

  async countKitchenBarOrders(empresaId: string): Promise<Result<KitchenBarCounts>> {
    try {
      // Cocina counts: per-item estado from pedido_item_estados
      const itemsResult = await this.fetchAllComidaItems(empresaId);
      if (!itemsResult.success) return { success: false, error: itemsResult.error };

      const cocina = this.tallyCocinaItems(itemsResult.data);

      // Bar counts: pure bebida orders in pendiente state (unchanged)
      const { data: activeSessions, error: sessionsError } = await this.supabase
        .from('mesa_sesiones')
        .select('id')
        .eq('empresa_id', empresaId)
        .is('cerrada_at', null);

      if (sessionsError) {
        await logger.logAndReturnError('DB_SELECT_ERROR', sessionsError.message, 'repository', 'SupabasePedidoRepository.countKitchenBarOrders', { details: { code: sessionsError.code, empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener sesiones activas', module: 'repository', method: 'countKitchenBarOrders' } };
      }

      const sessionIds = (activeSessions ?? []).map(s => (s as Record<string, unknown>).id as string);
      let bebidasTotal = 0;
      if (sessionIds.length > 0) {
        const bebidasResult = await this.countBebidasTotal(sessionIds);
        if (!bebidasResult.success) return { success: false, error: bebidasResult.error };
        bebidasTotal = bebidasResult.data;
      }

      return {
        success: true,
        data: {
          cocina: { total: cocina.total, listos: cocina.listos, retenidos: cocina.retenidos },
          bebidas: { total: bebidasTotal, listos: 0, retenidos: 0 },
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.countKitchenBarOrders', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findAllRetenidos(empresaId: string, tipo: 'comida' | 'bebida'): Promise<Result<RetenidoItem[]>> {
    try {
      const { data: estados, error } = await this.supabase
        .from('pedido_item_estados')
        .select(`
          item_idx,
          pedidos!inner(
            id, created_at, sesion_id, detalle_pedido, empresa_id,
            mesas!inner(id, numero, nombre)
          )
        `)
        .eq('estado', 'retenido')
        .eq('pedidos.empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabasePedidoRepository.findAllRetenidos', { details: { code: error.code, empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener retenidos', module: 'repository', method: 'findAllRetenidos' } };
      }

      const result: RetenidoItem[] = [];
      for (const row of estados ?? []) {
        const r = row as Record<string, unknown>;
        const pedido = r['pedidos'] as Record<string, unknown>;
        const mesa = pedido['mesas'] as Record<string, unknown>;
        const detalle = (pedido['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
        const idx = r['item_idx'] as number;
        const item = detalle[idx];
        if (!item) continue;
        const itemTipo = (item['tipo_producto'] as string | undefined) ?? 'comida';
        if (itemTipo !== tipo) continue;
        const complements = (item['complementos'] as Array<{ nombre?: string }> | undefined);
        result.push({
          itemId: pedido['id'] as string,
          nombre: item['nombre'] as string,
          cantidad: item['cantidad'] as number,
          complementos: complements?.map(c => c.nombre ?? '').filter(Boolean).join(', '),
          mesaId: (mesa['id'] as string | null) ?? null,
          mesaNumero: (mesa['numero'] as number) ?? null,
          mesaNombre: (mesa['nombre'] as string | null) ?? null,
          sesionCreatedAt: pedido['created_at'] as string ?? '',
        });
      }

      return { success: true, data: result };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findAllRetenidos', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findKitchenOrders(empresaId: string): Promise<Result<KitchenOrderItem[]>> {
    try {
      // Filter by empresa_id + estado directly — do NOT filter by active session.
      // Orders must remain visible in the kitchen after a mesa closes until they
      // are marked servido/cerrado/cancelado.
      const { data: orders, error: ordersError } = await this.supabase
        .from('pedidos')
        .select(`id, numero_pedido, sesion_id, detalle_pedido, estado, created_at, validated_at, mesas!inner(numero, nombre)`)
        .eq('empresa_id', empresaId)
        .in('estado', ['pendiente', 'anotado', 'preparado'])
        .order('created_at', { ascending: true });

      if (ordersError) {
        await logger.logAndReturnError('DB_SELECT_ERROR', ordersError.message, 'repository', 'SupabasePedidoRepository.findKitchenOrders', { details: { code: ordersError.code, empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos de cocina', module: 'repository', method: 'findKitchenOrders' } };
      }

      const result: KitchenOrderItem[] = [];
      for (const order of orders ?? []) {
        const row = order as Record<string, unknown>;
        const items = (row['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
        const comidaItems = items.filter(i => i['tipo_producto'] === 'comida');
        if (comidaItems.length === 0) continue;

        const mesaData = row['mesas'] as Record<string, unknown> ?? {};
        result.push({
          id: row['id'] as string,
          numeroPedido: row['numero_pedido'] as number,
          mesaNumero: (mesaData['numero'] as number) ?? null,
          mesaNombre: (mesaData['nombre'] as string | null) ?? null,
          items: comidaItems.map(i => ({
            nombre: i['nombre'] as string,
            cantidad: i['cantidad'] as number,
            complementos: i['complementos'] as { nombre?: string; name?: string }[] | undefined,
          })),
          estado: row['estado'] as string,
          createdAt: (row['validated_at'] as string | null) ?? (row['created_at'] as string),
          sesionId: (row['sesion_id'] as string | null) ?? null,
        });
      }

      return { success: true, data: result };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findKitchenOrders', { empresaId });
      return { success: false, error: appError };
    }
  }

  /**
   * Returns bebida items still pending for the bar page.
   *
   * Architecture notes:
   * - Mixed orders (comida + bebida) ARE included. `hasComida` flag lets the bar
   *   page PATCH the parent pedido to `anotado` (not `servido`) so kitchen items
   *   remain visible. Pure-bebida orders get PATCHed to `servido`.
   * - Per-item estado is the source of truth for multi-device sync:
   *   items already marked `servido` in pedido_item_estados are excluded here
   *   so every bar screen shows the same remaining work regardless of localStorage.
   * - `detallePedidoIdx` is the item's real position in detalle_pedido (not the
   *   filtered-array index). The bar page uses it as the stable swipe key and
   *   as the path param for per-item PATCH `/waiter/kitchen/items/:id/:idx/status`.
   */
  async findBarOrders(empresaId: string): Promise<Result<BarOrderItem[]>> {
    try {
      // Filter by empresa_id + estado directly — do NOT filter by active session.
      // Bar orders must remain visible after a mesa closes until served.
      const { data: orders, error: ordersError } = await this.supabase
        .from('pedidos')
        .select(`id, numero_pedido, sesion_id, detalle_pedido, estado, created_at, validated_at, mesas!inner(numero, nombre)`)
        .eq('empresa_id', empresaId)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true });

      if (ordersError) {
        await logger.logAndReturnError('DB_SELECT_ERROR', ordersError.message, 'repository', 'SupabasePedidoRepository.findBarOrders', { details: { code: ordersError.code, empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos de bar', module: 'repository', method: 'findBarOrders' } };
      }

      // Fetch per-item estados for all orders that have bebida items
      const orderRows = (orders ?? []) as Record<string, unknown>[];
      const pedidoIdsWithBebida = orderRows
        .filter(row => (row['detalle_pedido'] as Array<Record<string, unknown>>).some(i => i['tipo_producto'] === 'bebida'))
        .map(row => row['id'] as string);

      const estadoMap = new Map<string, Map<number, string>>();
      const fromValidationSet = new Set<string>(); // "pedidoId:itemIdx" — back in pendientes queue
      if (pedidoIdsWithBebida.length > 0) {
        const { data: itemEstados } = await this.supabase
          .from('pedido_item_estados')
          .select('pedido_id, item_idx, estado, from_validation')
          .in('pedido_id', pedidoIdsWithBebida);

        for (const row of itemEstados ?? []) {
          const r = row as Record<string, unknown>;
          const pid = r['pedido_id'] as string;
          const idx = r['item_idx'] as number;
          if (r['from_validation'] === true) { fromValidationSet.add(`${pid}:${idx}`); continue; }
          if (!estadoMap.has(pid)) estadoMap.set(pid, new Map());
          estadoMap.get(pid)!.set(idx, r['estado'] as string);
        }
      }

      const result: BarOrderItem[] = [];
      for (const order of orderRows) {
        const items = (order['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
        const mesaData = order['mesas'] as Record<string, unknown> ?? {};
        const pedidoId = order['id'] as string;
        const pedidoEstados = estadoMap.get(pedidoId) ?? new Map();

        const hasComida = items.some(i => i['tipo_producto'] === 'comida');

        // Only include bebida items not yet marked servido and not in the pendientes queue (from_validation=true)
        const bebidaItems: { nombre: string; cantidad: number; detallePedidoIdx: number; nota?: string }[] = [];
        items.forEach((item, fullIdx) => {
          const barItemEstado = pedidoEstados.get(fullIdx);
        if (
            item['tipo_producto'] === 'bebida' &&
            !fromValidationSet.has(`${pedidoId}:${fullIdx}`) &&
            barItemEstado !== 'servido' &&
            barItemEstado !== 'cancelado'
          ) {
            bebidaItems.push({ nombre: item['nombre'] as string, cantidad: item['cantidad'] as number, detallePedidoIdx: fullIdx, nota: (item['nota'] as string | undefined) || undefined });
          }
        });

        if (bebidaItems.length === 0) continue;

        result.push({
          id: order['id'] as string,
          numeroPedido: order['numero_pedido'] as number,
          mesaNumero: (mesaData['numero'] as number) ?? null,
          mesaNombre: (mesaData['nombre'] as string | null) ?? null,
          items: bebidaItems,
          estado: order['estado'] as string,
          createdAt: (order['validated_at'] as string | null) ?? (order['created_at'] as string),
          sesionId: (order['sesion_id'] as string | null) ?? null,
          tipo: 'bebida',
          hasComida,
        });
      }

      return { success: true, data: result };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findBarOrders', { empresaId });
      return { success: false, error: appError };
    }
  }

  // ── Per-item kitchen state ─────────────────────────────────────────────────

  /** Shared helper: fetch all comida items with their effective estado.
   * Does NOT filter by active session — orders must remain visible after mesa closes. */
  private async fetchAllComidaItems(empresaId: string): Promise<Result<KitchenItemRecord[]>> {
    try {
      const { data: orders, error: ordersError } = await this.supabase
        .from('pedidos')
        .select('id, estado, numero_pedido, sesion_id, detalle_pedido, created_at, mesas!inner(numero, nombre)')
        .eq('empresa_id', empresaId)
        .not('estado', 'in', '("servido","cerrado","cancelado","pendiente_validacion")')
        .order('created_at', { ascending: true });

      if (ordersError) {
        await logger.logAndReturnError('DB_SELECT_ERROR', ordersError.message, 'repository', 'SupabasePedidoRepository.fetchAllComidaItems', { details: { code: ordersError.code, empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pedidos', module: 'repository', method: 'fetchAllComidaItems' } };
      }

      const pedidoIds = (orders ?? [])
        .filter(o => {
          const items = (o as Record<string, unknown>)['detalle_pedido'] as Array<Record<string, unknown>>;
          return items.some(i => i['tipo_producto'] === 'comida');
        })
        .map(o => (o as Record<string, unknown>)['id'] as string);

      // Fetch item estados (empty Map if no pedidos)
      const estadoMap = new Map<string, Map<number, ItemEstado>>();
      if (pedidoIds.length > 0) {
        const { data: itemEstados, error: estadosError } = await this.supabase
          .from('pedido_item_estados')
          .select('pedido_id, item_idx, estado, from_validation')
          .in('pedido_id', pedidoIds);

        if (estadosError) {
          await logger.logAndReturnError('DB_SELECT_ERROR', estadosError.message, 'repository', 'SupabasePedidoRepository.fetchAllComidaItems', { details: { code: estadosError.code, empresaId } });
          return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener estados de ítems', module: 'repository', method: 'fetchAllComidaItems' } };
        }

        for (const row of itemEstados ?? []) {
          const r = row as Record<string, unknown>;
          // Skip from_validation=true: item auto-retained during pendientes validation,
          // already back in the pendientes queue — not a kitchen-retained item.
          if (r['from_validation'] === true) continue;
          const pid = r['pedido_id'] as string;
          if (!estadoMap.has(pid)) estadoMap.set(pid, new Map());
          estadoMap.get(pid)!.set(r['item_idx'] as number, r['estado'] as ItemEstado);
        }
      }

      const result: KitchenItemRecord[] = [];
      for (const order of orders ?? []) {
        const row = order as Record<string, unknown>;
        const items = (row['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
        const mesaData = row['mesas'] as Record<string, unknown> ?? {};
        const pedidoId = row['id'] as string;
        const pedidoEstados = estadoMap.get(pedidoId) ?? new Map<number, ItemEstado>();
        const pedidoNivelEstado = row['estado'] as string;

        items.forEach((item, idx) => {
          if (item['tipo_producto'] !== 'comida') return;
          const defaultEstado: ItemEstado = pedidoNivelEstado === 'retenido' ? 'retenido' : 'pendiente';
          const estado: ItemEstado = pedidoEstados.get(idx) ?? defaultEstado;
          const complements = item['complementos'] as Array<{ nombre?: string; name?: string }> | undefined;
          result.push({
            pedidoId,
            numeroPedido: row['numero_pedido'] as number,
            itemIdx: idx,
            nombre: (item['nombre'] as string) ?? '',
            cantidad: item['cantidad'] as number,
            complementos: complements?.map(c => c.nombre ?? c.name).filter(Boolean).join(', '),
            nota: (item['nota'] as string | undefined) || undefined,
            estado,
            mesaNumero: (mesaData['numero'] as number) ?? null,
            mesaNombre: (mesaData['nombre'] as string | null) ?? null,
            createdAt: row['created_at'] as string,
          });
        });
      }

      return { success: true, data: result };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.fetchAllComidaItems', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findWaiterKitchenItems(empresaId: string): Promise<Result<KitchenItemRecord[]>> {
    const orderItemsResult = await this.fetchAllComidaItems(empresaId);
    if (!orderItemsResult.success) return orderItemsResult;

    const visible = new Set<ItemEstado>(['pendiente', 'en_preparacion', 'listo', 'retenido']);
    return { success: true, data: orderItemsResult.data.filter(i => visible.has(i.estado)) };
  }

  async upsertItemEstado(empresaId: string, pedidoId: string, itemIdx: number, estado: ItemEstado): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('pedido_item_estados')
        .upsert(
          { pedido_id: pedidoId, item_idx: itemIdx, empresa_id: empresaId, estado, updated_at: new Date().toISOString(), from_validation: false },
          { onConflict: 'pedido_id,item_idx' }
        );

      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', 'SupabasePedidoRepository.upsertItemEstado', { details: { code: error.code, pedidoId, itemIdx, estado } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar estado del ítem', module: 'repository', method: 'upsertItemEstado' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.upsertItemEstado', { details: { pedidoId, itemIdx, estado } });
      return { success: false, error: appError };
    }
  }

  async findPendientesValidacion(empresaId: string): Promise<Result<PendienteValidacionMesa[]>> {
    try {
      // 1. Pedidos en cola de validación
      const { data: pedidos, error } = await this.supabase
        .from('pedidos')
        .select(`id, created_at, detalle_pedido, mesa_id, mesas!inner(numero, nombre)`)
        .eq('empresa_id', empresaId)
        .eq('estado', 'pendiente_validacion')
        .order('created_at', { ascending: true });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabasePedidoRepository.findPendientesValidacion', { details: { code: error.code, empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pendientes de validación', module: 'repository', method: 'findPendientesValidacion' } };
      }

      const mesaMap = buildPendientesMesaMap((pedidos ?? []) as Array<Record<string, unknown>>);

      // 2a. Ítems cancelados — excluirlos de la cola de pendientes
      const allPedidoIds = [...mesaMap.values()].flatMap(m => m.pedidos.map(p => p.id));
      if (allPedidoIds.length > 0) {
        const { data: cancelados } = await this.supabase
          .from('pedido_item_estados')
          .select('pedido_id, item_idx')
          .eq('empresa_id', empresaId)
          .eq('estado', 'cancelado')
          .in('pedido_id', allPedidoIds);
        const canceladoMap = buildIndexSetMap((cancelados ?? []) as Array<Record<string, unknown>>);
        if (canceladoMap.size > 0) applyCancelados(mesaMap, canceladoMap);
      }

      // 2b. Ítems retenidos durante validación — el camarero los libera desde pendientes
      const { data: retenidos } = await this.supabase
        .from('pedido_item_estados')
        .select('pedido_id, item_idx')
        .eq('empresa_id', empresaId)
        .eq('estado', 'retenido')
        .eq('from_validation', true);

      const retenidoMap = buildIndexSetMap((retenidos ?? []) as Array<Record<string, unknown>>);
      if (retenidoMap.size > 0) {
        const { data: validatedPedidos } = await this.supabase
          .from('pedidos')
          .select(`id, created_at, detalle_pedido, mesa_id, mesas!inner(numero, nombre)`)
          .eq('empresa_id', empresaId)
          .eq('estado', 'pendiente')
          .in('id', [...retenidoMap.keys()])
          .order('created_at', { ascending: true });
        addValidatedRetenidos(mesaMap, (validatedPedidos ?? []) as Array<Record<string, unknown>>, retenidoMap);
      }

      return { success: true, data: Array.from(mesaMap.values()) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findPendientesValidacion', { empresaId });
      return { success: false, error: appError };
    }
  }

  async validatePedido(empresaId: string, pedidoId: string, retainIndices: number[], pausedIndices: number[] = []): Promise<Result<void>> {
    try {
      const { data: pedido, error: fetchError } = await this.supabase
        .from('pedidos')
        .select('id, estado, detalle_pedido')
        .eq('id', pedidoId)
        .eq('empresa_id', empresaId)
        .single();

      if (fetchError || !pedido) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Pedido no encontrado', module: 'repository', method: 'validatePedido' } };
      }

      const p = pedido as Record<string, unknown>;
      if (p['estado'] !== 'pendiente_validacion') {
        return { success: false, error: { code: 'CONFLICT', message: 'El pedido no está pendiente de validación', module: 'repository', method: 'validatePedido' } };
      }

      const detalle = (p['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
      const maxIdx = detalle.length - 1;
      const validRetain = retainIndices.filter(i => i >= 0 && i <= maxIdx);

      // Auto-retained items (wrong tipo or not selected) → from_validation=true → reappear in pendientes
      if (validRetain.length > 0) {
        const upserts = validRetain.map(idx => ({
          pedido_id: pedidoId,
          item_idx: idx,
          empresa_id: empresaId,
          estado: 'retenido' as const,
          updated_at: new Date().toISOString(),
          from_validation: true,
        }));
        const { error: upsertError } = await this.supabase
          .from('pedido_item_estados')
          .upsert(upserts, { onConflict: 'pedido_id,item_idx' });
        if (upsertError) {
          await logger.logAndReturnError('DB_INSERT_ERROR', upsertError.message, 'repository', 'SupabasePedidoRepository.validatePedido', { details: { code: upsertError.code, pedidoId } });
          return { success: false, error: { code: 'DB_ERROR', message: 'Error al retener ítems', module: 'repository', method: 'validatePedido' } };
        }
      }

      // Intentionally paused items → from_validation=false → go to kitchen/bar retenidos only
      const validPaused = pausedIndices.filter(i => i >= 0 && i <= maxIdx);
      if (validPaused.length > 0) {
        const pausedUpserts = validPaused.map(idx => ({
          pedido_id: pedidoId,
          item_idx: idx,
          empresa_id: empresaId,
          estado: 'retenido' as const,
          updated_at: new Date().toISOString(),
          from_validation: false,
        }));
        const { error: pausedError } = await this.supabase
          .from('pedido_item_estados')
          .upsert(pausedUpserts, { onConflict: 'pedido_id,item_idx' });
        if (pausedError) {
          await logger.logAndReturnError('DB_INSERT_ERROR', pausedError.message, 'repository', 'SupabasePedidoRepository.validatePedido', { details: { code: pausedError.code, pedidoId } });
          return { success: false, error: { code: 'DB_ERROR', message: 'Error al pausar ítems', module: 'repository', method: 'validatePedido' } };
        }
      }

      const { error: updateError } = await this.supabase
        .from('pedidos')
        .update({ estado: 'pendiente', validated_at: new Date().toISOString() })
        .eq('id', pedidoId)
        .eq('empresa_id', empresaId);

      if (updateError) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', updateError.message, 'repository', 'SupabasePedidoRepository.validatePedido', { details: { code: updateError.code, pedidoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al validar pedido', module: 'repository', method: 'validatePedido' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.validatePedido', { details: { pedidoId } });
      return { success: false, error: appError };
    }
  }
}