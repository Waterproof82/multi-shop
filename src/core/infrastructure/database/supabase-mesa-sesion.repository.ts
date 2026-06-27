import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/core/domain/entities/types';
import { IMesaSesionRepository, MesaSesion, PendingItem, DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';
import { logger } from '../logging/logger';

export class SupabaseMesaSesionRepository implements IMesaSesionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async openSesion(mesaId: string, empresaId: string): Promise<Result<string>> {
    try {
      const { data, error } = await this.supabase
        .rpc('open_mesa_sesion', { p_mesa_id: mesaId, p_empresa_id: empresaId });

      if (error) {
        await logger.logAndReturnError(
          'DB_RPC_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.openSesion',
          { details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al abrir sesión de mesa', module: 'repository', method: 'openSesion' } };
      }

      const row = data as Record<string, unknown>;
      return { success: true, data: row['id'] as string };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.openSesion', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async closeSesion(sesionId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .rpc('close_mesa_sesion', { p_sesion_id: sesionId });

      if (error) {
        await logger.logAndReturnError(
          'DB_RPC_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.closeSesion',
          { details: { code: error.code, sesionId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al cerrar sesión de mesa', module: 'repository', method: 'closeSesion' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.closeSesion', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }

  async appendItems(sesionId: string, items: PendingItem[], itemsTotal: number): Promise<Result<void>> {
    try {
      const { data: current, error: fetchError } = await this.supabase
        .from('mesa_sesiones')
        .select('pending_items, pending_total')
        .eq('id', sesionId)
        .single();

      if (fetchError) {
        await logger.logAndReturnError('DB_SELECT_ERROR', fetchError.message, 'repository', 'SupabaseMesaSesionRepository.appendItems', { details: { code: fetchError.code, sesionId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al leer items pendientes', module: 'repository', method: 'appendItems' } };
      }

      const row = current as Record<string, unknown>;
      const existing = (row['pending_items'] as PendingItem[]) ?? [];
      const existingTotal = Number(row['pending_total']) ?? 0;

      const { error: updateError } = await this.supabase
        .from('mesa_sesiones')
        .update({
          pending_items: [...existing, ...items],
          pending_total: Math.round((existingTotal + itemsTotal) * 100) / 100,
        })
        .eq('id', sesionId);

      if (updateError) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', updateError.message, 'repository', 'SupabaseMesaSesionRepository.appendItems', { details: { code: updateError.code, sesionId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al guardar items', module: 'repository', method: 'appendItems' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.appendItems', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }

  async findActiveSesionByMesa(mesaId: string): Promise<Result<MesaSesion | null>> {
    try {
      const { data, error } = await this.supabase
        .from('mesa_sesiones')
        .select('id, mesa_id, empresa_id, total, pending_items, pending_total, cerrada_at, created_at, sesion_pagada, pago_en_curso')
        .eq('mesa_id', mesaId)
        .is('cerrada_at', null)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.findActiveSesionByMesa',
          { details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar sesión activa', module: 'repository', method: 'findActiveSesionByMesa' } };
      }

      if (!data) return { success: true, data: null };

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          mesaId: row['mesa_id'] as string,
          empresaId: row['empresa_id'] as string,
          total: row['total'] as number,
          pendingItems: (row['pending_items'] as PendingItem[]) ?? [],
          pendingTotal: Number(row['pending_total']) ?? 0,
          cerradaAt: (row['cerrada_at'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
          sesionPagada: (row['sesion_pagada'] as boolean) ?? false,
          pagoEnCurso: (row['pago_en_curso'] as boolean) ?? false,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.findActiveSesionByMesa', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async findSesionWithOrders(sesionId: string): Promise<Result<MesaSesion | null>> {
    try {
      const { data, error } = await this.supabase
        .from('mesa_sesiones')
        .select('id, mesa_id, empresa_id, total, pending_items, pending_total, cerrada_at, created_at, sesion_pagada, pago_en_curso')
        .eq('id', sesionId)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.findSesionWithOrders',
          { details: { code: error.code, sesionId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar sesión', module: 'repository', method: 'findSesionWithOrders' } };
      }

      if (!data) return { success: true, data: null };

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          mesaId: row['mesa_id'] as string,
          empresaId: row['empresa_id'] as string,
          total: row['total'] as number,
          pendingItems: (row['pending_items'] as PendingItem[]) ?? [],
          pendingTotal: Number(row['pending_total']) ?? 0,
          cerradaAt: (row['cerrada_at'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
          sesionPagada: (row['sesion_pagada'] as boolean) ?? false,
          pagoEnCurso: (row['pago_en_curso'] as boolean) ?? false,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.findSesionWithOrders', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }

  // items_diferidos column was dropped in migration 20260617000001.
  // Deferred items are now stored as pedidos with estado = 'retenido'.
  // These methods now operate on retenido pedidos via the pedidos table.
  async getDeferredItems(mesaId: string): Promise<Result<DeferredItem[]>> {
    try {
      const { data: sesion } = await this.supabase
        .from('mesa_sesiones')
        .select('id')
        .eq('mesa_id', mesaId)
        .is('cerrada_at', null)
        .maybeSingle();

      if (!sesion) return { success: true, data: [] };

      const { data, error } = await this.supabase
        .from('pedidos')
        .select('detalle_pedido')
        .eq('sesion_id', (sesion as { id: string }).id)
        .eq('estado', 'retenido');

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseMesaSesionRepository.getDeferredItems', { details: { code: error.code, mesaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener ítems retenidos', module: 'repository', method: 'getDeferredItems' } };
      }

      const items: DeferredItem[] = (data ?? []).flatMap(p => {
        const pedidoItems = (p['detalle_pedido'] as Array<{ nombre: string; precio: number; cantidad: number; complementos?: Array<{ nombre: string; precio: number }>; translations?: Record<string, { name?: string }> }>) ?? [];
        return pedidoItems.map(item => ({
          itemId: `${item.nombre}-${item.precio}`,
          itemName: item.nombre,
          price: item.precio,
          quantity: item.cantidad,
          selectedComplements: item.complementos?.map(c => ({ id: c.nombre, name: c.nombre, price: c.precio })),
          translations: item.translations as Record<string, { name: string }> | undefined,
        }));
      });

      return { success: true, data: items };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.getDeferredItems', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  // Calling setDeferredItems([]) releases all retenido pedidos by setting estado = 'pendiente'.
  // Writing new deferred items is no longer supported — use createMesaOrder with estado='retenido'.
  async setDeferredItems(mesaId: string, items: DeferredItem[]): Promise<Result<void>> {
    if (items.length > 0) return { success: true, data: undefined }; // write path obsolete
    try {
      const { data: sesion } = await this.supabase
        .from('mesa_sesiones')
        .select('id')
        .eq('mesa_id', mesaId)
        .is('cerrada_at', null)
        .maybeSingle();

      if (!sesion) return { success: true, data: undefined };

      const { error } = await this.supabase
        .from('pedidos')
        .update({ estado: 'pendiente' })
        .eq('sesion_id', (sesion as { id: string }).id)
        .eq('estado', 'retenido');

      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', 'SupabaseMesaSesionRepository.setDeferredItems', { details: { code: error.code, mesaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al liberar ítems retenidos', module: 'repository', method: 'setDeferredItems' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.setDeferredItems', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }
}
