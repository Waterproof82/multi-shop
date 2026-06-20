import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/core/domain/entities/types';
import { IMesaRepository, Mesa, MesaWithSession } from '@/core/domain/repositories/IMesaRepository';
import { logger } from '../logging/logger';
import type { DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';

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

  async findAllWithSession(empresaId: string): Promise<Result<MesaWithSession[]>> {
    try {
      // Step 1: fetch mesas + session flags via RPC (single LEFT JOIN — avoids PostgREST FK embed ambiguity)
      type RpcRow = {
        id: string; empresa_id: string; numero: number; nombre: string | null;
        sesion_id: string | null; sesion_pagada: boolean; pago_en_curso: boolean;
        session_total: number; cliente_activo: boolean; division_activa: boolean;
      };
      const { data: rpcData, error: rpcError } = await this.supabase
        .rpc('get_mesas_with_sessions', { p_empresa_id: empresaId });

      if (rpcError) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          rpcError.message,
          'repository',
          'SupabaseMesaRepository.findAllWithSession',
          { empresaId, details: { code: rpcError.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener mesas con sesión', module: 'repository', method: 'findAllWithSession' } };
      }

      const rows = (rpcData ?? []) as RpcRow[];
      const activeSesionIds = rows
        .map(r => r.sesion_id)
        .filter((id): id is string => id !== null);

      // Step 2: count active (non-cerrado) pedidos per session
      // + collect pedido numbers that have at least one item in 'listo' state (per-item kitchen state)
      // + collect retenido pedido items (replaces the dropped items_diferidos JSONB column)
      const countBySesion: Record<string, number> = {};
      const preparadoBySesion: Record<string, number[]> = {};
      const retenidoBySesion: Record<string, DeferredItem[]> = {};
      if (activeSesionIds.length > 0) {
        type PedidoRow = { id: string; sesion_id: string; estado: string; numero_pedido: number; detalle_pedido: unknown };
        const { data: activeData } = await this.supabase
          .from('pedidos')
          .select('id, sesion_id, estado, numero_pedido, detalle_pedido')
          .in('sesion_id', activeSesionIds)
          .neq('estado', 'cerrado');

        type DetalleItem = { nombre: string; precio: number; cantidad: number; complementos?: Array<{ nombre: string; precio: number }>; translations?: Record<string, { name?: string }> };
        const pedidoIdToSesion: Record<string, { sesionId: string; numeroPedido: number; estado: string; detalle: DetalleItem[] }> = {};
        for (const p of (activeData ?? []) as PedidoRow[]) {
          const sid = p.sesion_id;
          countBySesion[sid] = (countBySesion[sid] ?? 0) + 1;
          pedidoIdToSesion[p.id] = {
            sesionId: sid,
            numeroPedido: p.numero_pedido,
            estado: p.estado,
            detalle: (p.detalle_pedido as DetalleItem[]) ?? [],
          };
        }

        // Check pedido_item_estados for 'listo' and 'retenido' items
        const pedidoIds = Object.keys(pedidoIdToSesion);
        if (pedidoIds.length > 0) {
          const { data: itemEstados } = await this.supabase
            .from('pedido_item_estados')
            .select('pedido_id, item_idx, estado, from_validation')
            .in('pedido_id', pedidoIds);

          // Build per-pedido estado override map
          // Skip from_validation=true entries for the retenido check — those items are back in the
          // pendientes queue, not kitchen-retained, and must not appear as retenidos in the grid.
          const estadoMap = new Map<string, Map<number, string>>();
          for (const row of (itemEstados ?? []) as { pedido_id: string; item_idx: number; estado: string; from_validation: boolean }[]) {
            if (row.from_validation) continue;
            if (!estadoMap.has(row.pedido_id)) estadoMap.set(row.pedido_id, new Map());
            estadoMap.get(row.pedido_id)!.set(row.item_idx, row.estado);
          }

          for (const [pid, { sesionId, numeroPedido, estado: pedidoEstado, detalle }] of Object.entries(pedidoIdToSesion)) {
            const overrides = estadoMap.get(pid) ?? new Map<number, string>();
            const defaultEstado = pedidoEstado === 'retenido' ? 'retenido' : 'pendiente';

            // Listo check
            if ([...overrides.values()].some(e => e === 'listo')) {
              const nums = preparadoBySesion[sesionId] ?? [];
              if (!nums.includes(numeroPedido)) nums.push(numeroPedido);
              preparadoBySesion[sesionId] = nums;
            }

            // Retenido items (per-item effective estado)
            detalle.forEach((item, idx) => {
              const efectiveEstado = overrides.get(idx) ?? defaultEstado;
              if (efectiveEstado === 'retenido') {
                const deferredItem: DeferredItem = {
                  itemId: `${item.nombre}-${item.precio}`,
                  itemName: item.nombre,
                  price: item.precio,
                  quantity: item.cantidad,
                  selectedComplements: item.complementos?.map(c => ({ id: c.nombre, name: c.nombre, price: c.precio })),
                  translations: item.translations as Record<string, { name: string }> | undefined,
                };
                retenidoBySesion[sesionId] = [...(retenidoBySesion[sesionId] ?? []), deferredItem];
              }
            });
          }
        }
      }

      return {
        success: true,
        data: rows.map(row => ({
          id: row.id,
          empresaId: row.empresa_id,
          numero: row.numero,
          nombre: row.nombre ?? null,
          sesionId: row.sesion_id ?? null,
          activeOrderCount: row.sesion_id ? (countBySesion[row.sesion_id] ?? 0) : 0,
          sessionTotal: Number(row.session_total),
          sesionPagada: row.sesion_pagada ?? false,
          pagoEnCurso: row.pago_en_curso ?? false,
          divisionActiva: row.division_activa ?? false,
          itemsDiferidos: row.sesion_id ? (retenidoBySesion[row.sesion_id] ?? []) : [],
          clienteActivo: row.cliente_activo ?? false,
          preparadoPedidoNumbers: row.sesion_id ? (preparadoBySesion[row.sesion_id] ?? []) : [],
        })),
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaRepository.findAllWithSession', { empresaId });
      return { success: false, error: appError };
    }
  }
}
