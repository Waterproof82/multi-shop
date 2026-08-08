import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/core/domain/entities/types';
import { IMesaRepository, Mesa, MesaWithSession } from '@/core/domain/repositories/IMesaRepository';
import { logger } from '../logging/logger';
import type { DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';

// ── findAllWithSession: tipos y helpers ──────────────────────────────────────

/** Fila de `get_mesas_with_sessions`: mesa más los flags de su sesión abierta. */
type MesaSesionRow = {
  id: string; empresa_id: string; numero: number; nombre: string | null;
  sesion_id: string | null; sesion_pagada: boolean; pago_en_curso: boolean;
  session_total: number; cliente_activo: boolean; division_activa: boolean; llamada_activa: boolean;
};

type PedidoRow = {
  id: string; sesion_id: string | null; mesa_id: string | null;
  estado: string; numero_pedido: number; detalle_pedido: unknown;
};

type DetalleItem = {
  nombre: string; precio: number; cantidad: number;
  complementos?: Array<{ nombre: string; precio: number }>;
  translations?: Record<string, { name?: string }>;
};

/** Comanda ya resuelta a una sesión concreta. */
type PedidoDeSesion = { sesionId: string; numeroPedido: number; estado: string; detalle: DetalleItem[] };

/**
 * Reparte las comandas por sesión.
 *
 * `mesaToSesion` sirve para rescatar las HUÉRFANAS: pedidos con `sesion_id`
 * NULL que sí pertenecen a una mesa con sesión abierta. Ocurría cuando
 * `open_mesa_sesion` arrastraba la referencia a una sesión ya cerrada. Sin este
 * rescate la mesa aparece vacía teniendo comandas en cocina.
 *
 * Una huérfana cuya mesa tampoco tiene sesión se descarta: no hay dónde contarla.
 */
function indexarPedidosPorSesion(
  pedidos: PedidoRow[],
  mesaToSesion: Record<string, string>,
): { countBySesion: Record<string, number>; porPedido: Record<string, PedidoDeSesion> } {
  const countBySesion: Record<string, number> = {};
  const porPedido: Record<string, PedidoDeSesion> = {};

  for (const p of pedidos) {
    const sesionId = p.sesion_id ?? (p.mesa_id ? mesaToSesion[p.mesa_id] : null);
    if (!sesionId) continue;

    countBySesion[sesionId] = (countBySesion[sesionId] ?? 0) + 1;
    porPedido[p.id] = {
      sesionId,
      numeroPedido: p.numero_pedido,
      estado: p.estado,
      detalle: (p.detalle_pedido as DetalleItem[]) ?? [],
    };
  }

  return { countBySesion, porPedido };
}

type EstadoItemRow = { pedido_id: string; item_idx: number; estado: string; from_validation: boolean };

/**
 * Estados por ítem, agrupados por comanda.
 *
 * Se incluyen TODOS, también los de `from_validation = true`: un ítem que pasó
 * por la cola de validación sigue pudiendo estar 'listo' en cocina, y excluirlo
 * dejaría platos terminados sin avisar al camarero. No aparecerán como
 * retenidos porque su estado ya nunca vuelve a ser 'retenido'.
 */
function agruparEstadosPorPedido(filas: EstadoItemRow[]): Map<string, Map<number, string>> {
  const mapa = new Map<string, Map<number, string>>();
  for (const fila of filas) {
    if (!mapa.has(fila.pedido_id)) mapa.set(fila.pedido_id, new Map());
    mapa.get(fila.pedido_id)!.set(fila.item_idx, fila.estado);
  }
  return mapa;
}

function aItemDiferido(item: DetalleItem): DeferredItem {
  return {
    itemId: `${item.nombre}-${item.precio}`,
    itemName: item.nombre,
    price: item.precio,
    quantity: item.cantidad,
    selectedComplements: item.complementos?.map(c => ({ id: c.nombre, name: c.nombre, price: c.precio })),
    translations: item.translations as Record<string, { name: string }> | undefined,
  };
}

/**
 * Deriva, por sesión, qué comandas tienen algo listo para servir y qué ítems
 * quedaron retenidos.
 *
 * El estado EFECTIVO de un ítem es el suyo propio si existe en
 * `pedido_item_estados`, y si no el que hereda del pedido. Confundir ambos hace
 * que platos retenidos se muestren como pendientes, o al revés.
 */
function derivarEstadoDeSesiones(
  porPedido: Record<string, PedidoDeSesion>,
  estadosPorPedido: Map<string, Map<number, string>>,
): { preparadoBySesion: Record<string, number[]>; retenidoBySesion: Record<string, DeferredItem[]> } {
  const preparadoBySesion: Record<string, number[]> = {};
  const retenidoBySesion: Record<string, DeferredItem[]> = {};

  for (const [pedidoId, pedido] of Object.entries(porPedido)) {
    const estados = estadosPorPedido.get(pedidoId) ?? new Map<number, string>();
    const heredado = pedido.estado === 'retenido' ? 'retenido' : 'pendiente';

    if ([...estados.values()].includes('listo')) {
      const numeros = preparadoBySesion[pedido.sesionId] ?? [];
      if (!numeros.includes(pedido.numeroPedido)) numeros.push(pedido.numeroPedido);
      preparadoBySesion[pedido.sesionId] = numeros;
    }

    const retenidos = pedido.detalle.filter((_, idx) => (estados.get(idx) ?? heredado) === 'retenido');
    if (retenidos.length > 0) {
      retenidoBySesion[pedido.sesionId] = [
        ...(retenidoBySesion[pedido.sesionId] ?? []),
        ...retenidos.map(aItemDiferido),
      ];
    }
  }

  return { preparadoBySesion, retenidoBySesion };
}

interface EstadoDeSesiones {
  countBySesion: Record<string, number>;
  preparadoBySesion: Record<string, number[]>;
  retenidoBySesion: Record<string, DeferredItem[]>;
}

const SIN_SESIONES: EstadoDeSesiones = { countBySesion: {}, preparadoBySesion: {}, retenidoBySesion: {} };

function mapearMesa(row: MesaSesionRow, estado: EstadoDeSesiones): MesaWithSession {
  const sesionId = row.sesion_id ?? null;
  return {
    id: row.id,
    empresaId: row.empresa_id,
    numero: row.numero,
    nombre: row.nombre ?? null,
    sesionId,
    activeOrderCount: sesionId ? (estado.countBySesion[sesionId] ?? 0) : 0,
    sessionTotal: Number(row.session_total),
    sesionPagada: row.sesion_pagada ?? false,
    pagoEnCurso: row.pago_en_curso ?? false,
    divisionActiva: row.division_activa ?? false,
    itemsDiferidos: sesionId ? (estado.retenidoBySesion[sesionId] ?? []) : [],
    clienteActivo: row.cliente_activo ?? false,
    preparadoPedidoNumbers: sesionId ? (estado.preparadoBySesion[sesionId] ?? []) : [],
    llamadaActiva: row.llamada_activa ?? false,
  };
}

export class SupabaseMesaRepository implements IMesaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(mesaId: string): Promise<Result<Mesa | null>> {
    try {
      const { data, error } = await this.supabase
        .from('mesas')
        .select('id, empresa_id, numero, nombre, created_at')
        .eq('id', mesaId)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.findById',
          { details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar mesa', module: 'repository', method: 'findById' } };
      }

      if (!data) return { success: true, data: null };

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          empresaId: row['empresa_id'] as string,
          numero: row['numero'] as number,
          nombre: (row['nombre'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.findById', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async findByEmpresa(empresaId: string): Promise<Result<Mesa[]>> {
    try {
      const { data, error } = await this.supabase
        .from('mesas')
        .select('id, empresa_id, numero, nombre, created_at')
        .eq('empresa_id', empresaId)
        .order('numero', { ascending: true });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.findByEmpresa',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener mesas', module: 'repository', method: 'findByEmpresa' } };
      }

      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        success: true,
        data: rows.map(row => ({
          id: row['id'] as string,
          empresaId: row['empresa_id'] as string,
          numero: row['numero'] as number,
          nombre: (row['nombre'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        })),
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.findByEmpresa', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>> {
    try {
      const insertPayload: Record<string, unknown> = {
        empresa_id: empresaId,
        numero,
      };
      if (nombre !== undefined) {
        insertPayload['nombre'] = nombre;
      }

      const { data, error } = await this.supabase
        .from('mesas')
        .insert(insertPayload)
        .select('id, empresa_id, numero, nombre, created_at')
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.create',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear mesa', module: 'repository', method: 'create' } };
      }

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          empresaId: row['empresa_id'] as string,
          numero: row['numero'] as number,
          nombre: (row['nombre'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.create', { empresaId });
      return { success: false, error: appError };
    }
  }

  async update(mesaId: string, empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>> {
    try {
      const updatePayload: Record<string, unknown> = { numero };
      if (nombre !== undefined) {
        updatePayload['nombre'] = nombre;
      }

      const { data, error } = await this.supabase
        .from('mesas')
        .update(updatePayload)
        .eq('id', mesaId)
        .eq('empresa_id', empresaId)
        .select('id, empresa_id, numero, nombre, created_at')
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.update',
          { empresaId, details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar mesa', module: 'repository', method: 'update' } };
      }

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          empresaId: row['empresa_id'] as string,
          numero: row['numero'] as number,
          nombre: (row['nombre'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.update', { empresaId, details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async delete(mesaId: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('mesas')
        .delete()
        .eq('id', mesaId)
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.delete',
          { empresaId, details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar mesa', module: 'repository', method: 'delete' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.delete', { empresaId, details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  /** Comandas activas de las sesiones abiertas, incluidas las huerfanas. */
  private async cargarPedidosActivos(sesionIds: string[], mesaIds: string[]): Promise<PedidoRow[]> {
    // Las dos consultas son independientes entre si — en serie duplicaban la
    // latencia de una funcion que alimenta mostrador y panel de camarero, y que
    // se re-dispara con cada evento Realtime y en cada visibilitychange.
    const [{ data: porSesion }, { data: huerfanos }] = await Promise.all([
      this.supabase
        .from('pedidos')
        .select('id, sesion_id, mesa_id, estado, numero_pedido, detalle_pedido')
        .in('sesion_id', sesionIds)
        .neq('estado', 'cerrado')
        .neq('estado', 'cancelado'),
      this.supabase
        .from('pedidos')
        .select('id, sesion_id, mesa_id, estado, numero_pedido, detalle_pedido')
        .in('mesa_id', mesaIds)
        .is('sesion_id', null)
        .neq('estado', 'cerrado')
        .neq('estado', 'cancelado'),
    ]);

    return [...(porSesion ?? []), ...(huerfanos ?? [])] as PedidoRow[];
  }

  private async cargarEstadosDeItems(pedidoIds: string[]): Promise<Map<string, Map<number, string>>> {
    if (pedidoIds.length === 0) return new Map();
    const { data } = await this.supabase
      .from('pedido_item_estados')
      .select('pedido_id, item_idx, estado, from_validation')
      .in('pedido_id', pedidoIds);
    return agruparEstadosPorPedido((data ?? []) as EstadoItemRow[]);
  }

  /** Cruce de comandas y estados por item para las sesiones abiertas. */
  private async resolverEstadoDeSesiones(rows: MesaSesionRow[]): Promise<EstadoDeSesiones> {
    const conSesion = rows.filter(r => r.sesion_id !== null);
    if (conSesion.length === 0) return SIN_SESIONES;

    const pedidos = await this.cargarPedidosActivos(
      conSesion.map(r => r.sesion_id as string),
      conSesion.map(r => r.id),
    );

    const mesaToSesion: Record<string, string> = {};
    for (const r of conSesion) mesaToSesion[r.id] = r.sesion_id as string;

    const { countBySesion, porPedido } = indexarPedidosPorSesion(pedidos, mesaToSesion);
    const estados = await this.cargarEstadosDeItems(Object.keys(porPedido));

    return { countBySesion, ...derivarEstadoDeSesiones(porPedido, estados) };
  }

  /**
   * Mesas con el estado de su sesion abierta: cuantas comandas activas tienen,
   * cuales estan listas para servir y que items quedaron retenidos.
   *
   * Es una de las rutas mas calientes del sistema: alimenta el mostrador del TPV
   * y el panel de mesas, y se re-dispara con cada evento de Realtime.
   */
  async findAllWithSession(empresaId: string): Promise<Result<MesaWithSession[]>> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_mesas_with_sessions', { p_empresa_id: empresaId });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaRepository.findAllWithSession',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener mesas con sesión', module: 'repository', method: 'findAllWithSession' } };
      }

      const rows = (data ?? []) as MesaSesionRow[];
      const estado = await this.resolverEstadoDeSesiones(rows);

      return { success: true, data: rows.map(row => mapearMesa(row, estado)) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.findAllWithSession', { empresaId });
      return { success: false, error: appError };
    }
  }
}
