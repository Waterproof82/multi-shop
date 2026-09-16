import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IMenuVirtualRepository,
  CreateMenuVirtualData,
  UpdateMenuVirtualData,
  MenuVirtualProductoAsignacion,
} from '@/core/domain/repositories/IMenuVirtualRepository';
import type { MenuVirtual, Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

export class SupabaseMenuVirtualRepository implements IMenuVirtualRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapRow(row: Record<string, unknown>): MenuVirtual {
    return {
      id: row.id as string,
      empresaId: row.empresa_id as string,
      padreId: (row.padre_id as string | null) ?? null,
      nombre: row.nombre_es as string,
      translations: {
        en: (row.nombre_en as string | null) ?? undefined,
        fr: (row.nombre_fr as string | null) ?? undefined,
        it: (row.nombre_it as string | null) ?? undefined,
        de: (row.nombre_de as string | null) ?? undefined,
      },
      orden: (row.orden as number) ?? 0,
    };
  }

  async findAllByTenant(empresaId: string): Promise<Result<MenuVirtual[]>> {
    try {
      const { data, error } = await this.supabase
        .from('menus_virtuales')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.findAllByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener menús virtuales', module: 'repository', method: 'findAllByTenant' } };
      }

      return { success: true, data: ((data ?? []) as Record<string, unknown>[]).map(r => this.mapRow(r)) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findAsignacionesByTenant(empresaId: string): Promise<Result<MenuVirtualProductoAsignacion[]>> {
    try {
      const { data, error } = await this.supabase
        .from('menu_virtual_productos')
        .select('menu_virtual_id, producto_id')
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.findAsignacionesByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener asignaciones de menús virtuales', module: 'repository', method: 'findAsignacionesByTenant' } };
      }

      const mapped = ((data ?? []) as Record<string, unknown>[]).map(row => ({
        menuVirtualId: row.menu_virtual_id as string,
        productoId: row.producto_id as string,
      }));

      return { success: true, data: mapped };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.findAsignacionesByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findProductoIdsByMenuVirtual(menuVirtualId: string, empresaId: string): Promise<Result<string[]>> {
    try {
      const { data, error } = await this.supabase
        .from('menu_virtual_productos')
        .select('producto_id')
        .eq('menu_virtual_id', menuVirtualId)
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.findProductoIdsByMenuVirtual', { details: { menuVirtualId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener productos del menú virtual', module: 'repository', method: 'findProductoIdsByMenuVirtual' } };
      }

      return { success: true, data: ((data ?? []) as Record<string, unknown>[]).map(r => r.producto_id as string) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.findProductoIdsByMenuVirtual', { details: { menuVirtualId } });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateMenuVirtualData): Promise<Result<MenuVirtual>> {
    try {
      const { data: created, error } = await this.supabase
        .from('menus_virtuales')
        .insert({
          empresa_id: data.empresaId,
          padre_id: data.padreId ?? null,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en ?? null,
          nombre_fr: data.nombre_fr ?? null,
          nombre_it: data.nombre_it ?? null,
          nombre_de: data.nombre_de ?? null,
          orden: data.orden ?? 0,
        })
        .select()
        .single();

      if (error || !created) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseMenuVirtualRepository.create', { details: { data } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear menú virtual', module: 'repository', method: 'create' } };
      }

      return { success: true, data: this.mapRow(created as Record<string, unknown>) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.create', { details: { data } });
      return { success: false, error: appError };
    }
  }

  async update(id: string, empresaId: string, data: UpdateMenuVirtualData): Promise<Result<MenuVirtual>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.nombre_es !== undefined) updateData.nombre_es = data.nombre_es;
      if (data.nombre_en !== undefined) updateData.nombre_en = data.nombre_en;
      if (data.nombre_fr !== undefined) updateData.nombre_fr = data.nombre_fr;
      if (data.nombre_it !== undefined) updateData.nombre_it = data.nombre_it;
      if (data.nombre_de !== undefined) updateData.nombre_de = data.nombre_de;
      if (data.orden !== undefined) updateData.orden = data.orden;

      const { data: updated, error } = await this.supabase
        .from('menus_virtuales')
        .update(updateData)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select()
        .single();

      if (error || !updated) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseMenuVirtualRepository.update', { details: { id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar menú virtual', module: 'repository', method: 'update' } };
      }

      return { success: true, data: this.mapRow(updated as Record<string, unknown>) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.update', { details: { id } });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('menus_virtuales')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_DELETE_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.delete', { details: { id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar menú virtual', module: 'repository', method: 'delete' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.delete', { details: { id } });
      return { success: false, error: appError };
    }
  }

  async setProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>> {
    try {
      // Scoped by empresa_id ademas de menu_virtual_id (mas estricto que el
      // precedente de setProductoGrupos, que solo filtra por producto_id) —
      // evita que un admin de otra empresa pueda tocar asignaciones ajenas
      // adivinando un menuVirtualId.
      const { error: delErr } = await this.supabase
        .from('menu_virtual_productos')
        .delete()
        .eq('menu_virtual_id', menuVirtualId)
        .eq('empresa_id', empresaId);

      if (delErr) {
        await logger.logAndReturnError('DB_DELETE_ERROR', delErr.message, 'repository', 'SupabaseMenuVirtualRepository.setProductos', { details: { menuVirtualId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar productos del menú virtual', module: 'repository', method: 'setProductos' } };
      }

      if (productoIds.length === 0) return { success: true, data: undefined };

      const rows = productoIds.map((productoId, idx) => ({
        empresa_id: empresaId,
        menu_virtual_id: menuVirtualId,
        producto_id: productoId,
        orden: idx,
      }));
      const { error: insErr } = await this.supabase
        .from('menu_virtual_productos')
        .insert(rows);

      if (insErr) {
        await logger.logAndReturnError('DB_INSERT_ERROR', insErr.message, 'repository', 'SupabaseMenuVirtualRepository.setProductos', { details: { menuVirtualId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al insertar productos del menú virtual', module: 'repository', method: 'setProductos' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.setProductos', { details: { menuVirtualId } });
      return { success: false, error: appError };
    }
  }
}
