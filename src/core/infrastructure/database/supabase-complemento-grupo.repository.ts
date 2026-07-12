import { SupabaseClient } from '@supabase/supabase-js';
import type { IComplementoGrupoRepository, CreateComplementoGrupoData, UpdateComplementoGrupoData, CreateComplementoOpcionData } from '@/core/domain/repositories/IComplementoGrupoRepository';
import type { ComplementoGrupo, ComplementoOpcion, ProductoComplementoAsignacion } from '@/core/domain/entities/complemento-types';
import type { Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

export class SupabaseComplementoGrupoRepository implements IComplementoGrupoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapOpcion(row: Record<string, unknown>): ComplementoOpcion {
    return {
      id: row.id as string,
      grupoId: row.grupo_id as string,
      empresaId: row.empresa_id as string,
      nombre_es: row.nombre_es as string,
      nombre_en: (row.nombre_en as string | null) ?? null,
      nombre_fr: (row.nombre_fr as string | null) ?? null,
      nombre_it: (row.nombre_it as string | null) ?? null,
      nombre_de: (row.nombre_de as string | null) ?? null,
      precioAdicional: Number(row.precio_adicional ?? 0),
      orden: (row.orden as number) ?? 0,
      activo: (row.activo as boolean) ?? true,
      createdAt: new Date(row.created_at as string),
    };
  }

  private mapGrupo(row: Record<string, unknown>, opciones: ComplementoOpcion[]): ComplementoGrupo {
    return {
      id: row.id as string,
      empresaId: row.empresa_id as string,
      nombre_es: row.nombre_es as string,
      nombre_en: (row.nombre_en as string | null) ?? null,
      nombre_fr: (row.nombre_fr as string | null) ?? null,
      nombre_it: (row.nombre_it as string | null) ?? null,
      nombre_de: (row.nombre_de as string | null) ?? null,
      tipo: row.tipo as 'radio' | 'checkbox',
      obligatorio: (row.obligatorio as boolean) ?? false,
      orden: (row.orden as number) ?? 0,
      createdAt: new Date(row.created_at as string),
      opciones,
    };
  }

  async findAllByTenant(empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    try {
      const { data: grupos, error: gErr } = await this.supabase
        .from('complemento_grupos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (gErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', gErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findAllByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener grupos de complementos', module: 'repository', method: 'findAllByTenant' } };
      }

      if (!grupos || grupos.length === 0) return { success: true, data: [] };

      const grupoIds = (grupos as Record<string, unknown>[]).map(g => g.id as string);
      const { data: opciones, error: oErr } = await this.supabase
        .from('complemento_opciones')
        .select('*')
        .in('grupo_id', grupoIds)
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (oErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', oErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findAllByTenant.opciones', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener opciones de complementos', module: 'repository', method: 'findAllByTenant' } };
      }

      const opcionesByGrupo = new Map<string, ComplementoOpcion[]>();
      for (const o of (opciones ?? []) as Record<string, unknown>[]) {
        const mapped = this.mapOpcion(o);
        const arr = opcionesByGrupo.get(mapped.grupoId) ?? [];
        arr.push(mapped);
        opcionesByGrupo.set(mapped.grupoId, arr);
      }

      const data = (grupos as Record<string, unknown>[]).map(g =>
        this.mapGrupo(g, opcionesByGrupo.get(g.id as string) ?? [])
      );

      return { success: true, data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findByIds(grupoIds: string[], empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    try {
      if (grupoIds.length === 0) return { success: true, data: [] };

      const { data: grupos, error: gErr } = await this.supabase
        .from('complemento_grupos')
        .select('*')
        .in('id', grupoIds)
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (gErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', gErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findByIds', { details: { grupoIds } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener grupos de complementos', module: 'repository', method: 'findByIds' } };
      }

      if (!grupos || grupos.length === 0) return { success: true, data: [] };

      const { data: opciones, error: oErr } = await this.supabase
        .from('complemento_opciones')
        .select('*')
        .in('grupo_id', grupoIds)
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (oErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', oErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findByIds.opciones', { details: { grupoIds } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener opciones de complementos', module: 'repository', method: 'findByIds' } };
      }

      const opcionesByGrupo = new Map<string, ComplementoOpcion[]>();
      for (const o of (opciones ?? []) as Record<string, unknown>[]) {
        const mapped = this.mapOpcion(o);
        const arr = opcionesByGrupo.get(mapped.grupoId) ?? [];
        arr.push(mapped);
        opcionesByGrupo.set(mapped.grupoId, arr);
      }

      const data = (grupos as Record<string, unknown>[]).map(g =>
        this.mapGrupo(g, opcionesByGrupo.get(g.id as string) ?? [])
      );

      return { success: true, data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.findByIds', { details: { grupoIds } });
      return { success: false, error: appError };
    }
  }

  async findByProducto(productoId: string, empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    try {
      const { data: asig, error: aErr } = await this.supabase
        .from('producto_complemento_grupos')
        .select('grupo_id, orden')
        .eq('producto_id', productoId)
        .order('orden', { ascending: true });

      if (aErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', aErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findByProducto', { details: { productoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener complementos del producto', module: 'repository', method: 'findByProducto' } };
      }

      if (!asig || asig.length === 0) return { success: true, data: [] };

      const grupoIds = (asig as Record<string, unknown>[]).map(a => a.grupo_id as string);
      return this.findByIds(grupoIds, empresaId);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.findByProducto', { details: { productoId } });
      return { success: false, error: appError };
    }
  }

  async findAssignmentsByProductos(productoIds: string[], empresaId: string): Promise<Result<ProductoComplementoAsignacion[]>> {
    try {
      if (productoIds.length === 0) return { success: true, data: [] };

      const { data, error } = await this.supabase
        .from('producto_complemento_grupos')
        .select('producto_id, grupo_id, orden')
        .in('producto_id', productoIds);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseComplementoGrupoRepository.findAssignmentsByProductos', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener asignaciones de complementos', module: 'repository', method: 'findAssignmentsByProductos' } };
      }

      const mapped = ((data ?? []) as Record<string, unknown>[]).map(row => ({
        productoId: row.producto_id as string,
        grupoId: row.grupo_id as string,
        orden: (row.orden as number) ?? 0,
      }));

      return { success: true, data: mapped };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.findAssignmentsByProductos', { empresaId });
      return { success: false, error: appError };
    }
  }

  async createGrupo(data: CreateComplementoGrupoData): Promise<Result<ComplementoGrupo>> {
    try {
      const { data: created, error } = await this.supabase
        .from('complemento_grupos')
        .insert({
          empresa_id: data.empresaId,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en ?? null,
          nombre_fr: data.nombre_fr ?? null,
          nombre_it: data.nombre_it ?? null,
          nombre_de: data.nombre_de ?? null,
          tipo: data.tipo,
          obligatorio: data.obligatorio,
          orden: data.orden ?? 0,
        })
        .select()
        .single();

      if (error || !created) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseComplementoGrupoRepository.createGrupo', { details: { data } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear grupo de complementos', module: 'repository', method: 'createGrupo' } };
      }

      return { success: true, data: this.mapGrupo(created as Record<string, unknown>, []) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.createGrupo', { details: { data } });
      return { success: false, error: appError };
    }
  }

  async updateGrupo(id: string, empresaId: string, data: UpdateComplementoGrupoData): Promise<Result<ComplementoGrupo>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.nombre_es !== undefined) updateData.nombre_es = data.nombre_es;
      if (data.nombre_en !== undefined) updateData.nombre_en = data.nombre_en;
      if (data.nombre_fr !== undefined) updateData.nombre_fr = data.nombre_fr;
      if (data.nombre_it !== undefined) updateData.nombre_it = data.nombre_it;
      if (data.nombre_de !== undefined) updateData.nombre_de = data.nombre_de;
      if (data.tipo !== undefined) updateData.tipo = data.tipo;
      if (data.obligatorio !== undefined) updateData.obligatorio = data.obligatorio;
      if (data.orden !== undefined) updateData.orden = data.orden;

      const { data: updated, error } = await this.supabase
        .from('complemento_grupos')
        .update(updateData)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select()
        .single();

      if (error || !updated) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseComplementoGrupoRepository.updateGrupo', { details: { id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar grupo de complementos', module: 'repository', method: 'updateGrupo' } };
      }

      const opcionesResult = await this.findByIds([id], empresaId);
      const opciones = opcionesResult.success ? (opcionesResult.data[0]?.opciones ?? []) : [];

      return { success: true, data: this.mapGrupo(updated as Record<string, unknown>, opciones) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.updateGrupo', { details: { id } });
      return { success: false, error: appError };
    }
  }

  async deleteGrupo(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('complemento_grupos')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_DELETE_ERROR', error.message, 'repository', 'SupabaseComplementoGrupoRepository.deleteGrupo', { details: { id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar grupo de complementos', module: 'repository', method: 'deleteGrupo' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.deleteGrupo', { details: { id } });
      return { success: false, error: appError };
    }
  }

  async createOpcion(data: CreateComplementoOpcionData): Promise<Result<{ id: string }>> {
    try {
      const { data: created, error } = await this.supabase
        .from('complemento_opciones')
        .insert({
          grupo_id: data.grupoId,
          empresa_id: data.empresaId,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en ?? null,
          nombre_fr: data.nombre_fr ?? null,
          nombre_it: data.nombre_it ?? null,
          nombre_de: data.nombre_de ?? null,
          precio_adicional: data.precioAdicional ?? 0,
          orden: data.orden ?? 0,
        })
        .select('id')
        .single();

      if (error || !created) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseComplementoGrupoRepository.createOpcion', { details: { data } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear opción de complemento', module: 'repository', method: 'createOpcion' } };
      }

      return { success: true, data: { id: (created as Record<string, unknown>).id as string } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.createOpcion', { details: { data } });
      return { success: false, error: appError };
    }
  }

  async updateOpcion(id: string, grupoId: string, data: Partial<CreateComplementoOpcionData>): Promise<Result<void>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.nombre_es !== undefined) updateData.nombre_es = data.nombre_es;
      if (data.nombre_en !== undefined) updateData.nombre_en = data.nombre_en;
      if (data.nombre_fr !== undefined) updateData.nombre_fr = data.nombre_fr;
      if (data.nombre_it !== undefined) updateData.nombre_it = data.nombre_it;
      if (data.nombre_de !== undefined) updateData.nombre_de = data.nombre_de;
      if (data.precioAdicional !== undefined) updateData.precio_adicional = data.precioAdicional;
      if (data.orden !== undefined) updateData.orden = data.orden;

      const { error } = await this.supabase
        .from('complemento_opciones')
        .update(updateData)
        .eq('id', id)
        .eq('grupo_id', grupoId);

      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', 'SupabaseComplementoGrupoRepository.updateOpcion', { details: { id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar opción de complemento', module: 'repository', method: 'updateOpcion' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.updateOpcion', { details: { id } });
      return { success: false, error: appError };
    }
  }

  async deleteOpcion(id: string, grupoId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('complemento_opciones')
        .delete()
        .eq('id', id)
        .eq('grupo_id', grupoId);

      if (error) {
        await logger.logAndReturnError('DB_DELETE_ERROR', error.message, 'repository', 'SupabaseComplementoGrupoRepository.deleteOpcion', { details: { id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar opción de complemento', module: 'repository', method: 'deleteOpcion' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.deleteOpcion', { details: { id } });
      return { success: false, error: appError };
    }
  }

  async setProductoGrupos(productoId: string, grupoIds: string[], empresaId: string): Promise<Result<void>> {
    try {
      const { error: delErr } = await this.supabase
        .from('producto_complemento_grupos')
        .delete()
        .eq('producto_id', productoId);

      if (delErr) {
        await logger.logAndReturnError('DB_DELETE_ERROR', delErr.message, 'repository', 'SupabaseComplementoGrupoRepository.setProductoGrupos', { details: { productoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar asignaciones de complementos', module: 'repository', method: 'setProductoGrupos' } };
      }

      if (grupoIds.length === 0) return { success: true, data: undefined };

      const rows = grupoIds.map((grupoId, idx) => ({ empresa_id: empresaId, producto_id: productoId, grupo_id: grupoId, orden: idx }));
      const { error: insErr } = await this.supabase
        .from('producto_complemento_grupos')
        .insert(rows);

      if (insErr) {
        await logger.logAndReturnError('DB_INSERT_ERROR', insErr.message, 'repository', 'SupabaseComplementoGrupoRepository.setProductoGrupos', { details: { productoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al insertar asignaciones de complementos', module: 'repository', method: 'setProductoGrupos' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.setProductoGrupos', { details: { productoId } });
      return { success: false, error: appError };
    }
  }
}
