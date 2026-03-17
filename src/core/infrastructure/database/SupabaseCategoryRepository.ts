import { SupabaseClient } from "@supabase/supabase-js";
import { ICategoryRepository, CreateCategoryData, UpdateCategoryData } from "@/core/domain/repositories/ICategoryRepository";
import { Category, Result } from "@/core/domain/entities/types";
import { logger } from "../logging/logger";

export class SupabaseCategoryRepository implements ICategoryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapToDomain(row: Record<string, unknown>): Category {
    return {
      id: row.id as string,
      empresaId: row.empresa_id as string,
      nombre: row.nombre_es as string | null,
      descripcion: (row.descripcion_es as string | null) || null,
      orden: (row.orden as number) || 0,
      categoriaComplementoDe: (row.categoria_complemento_de as string | null) || null,
      complementoObligatorio: (row.complemento_obligatorio as boolean) || false,
      categoriaPadreId: (row.categoria_padre_id as string | null) || null,
      translations: {
        en: (row.nombre_en as string | undefined) || undefined,
        fr: (row.nombre_fr as string | undefined) || undefined,
        it: (row.nombre_it as string | undefined) || undefined,
        de: (row.nombre_de as string | undefined) || undefined,
      },
      descripcionTranslations: {
        en: (row.descripcion_en as string | undefined) || undefined,
        fr: (row.descripcion_fr as string | undefined) || undefined,
        it: (row.descripcion_it as string | undefined) || undefined,
        de: (row.descripcion_de as string | undefined) || undefined,
      },
    };
  }

  async findAllByTenant(empresaId: string): Promise<Result<Category[]>> {
    try {
      const { data, error } = await this.supabase
        .from("categorias")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseCategoryRepository.findAllByTenant',
          { empresaId, details: { code: error.code, hint: error.hint } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al obtener categorías', 
            module: 'repository', 
            method: 'findAllByTenant' 
          } 
        };
      }

      return { success: true, data: data.map((row: Record<string, unknown>) => this.mapToDomain(row)) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseCategoryRepository.findAllByTenant', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateCategoryData): Promise<Result<Category>> {
    try {
      const { data: created, error } = await this.supabase
        .from("categorias")
        .insert({
          empresa_id: data.empresaId,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en || null,
          nombre_fr: data.nombre_fr || null,
          nombre_it: data.nombre_it || null,
          nombre_de: data.nombre_de || null,
          descripcion_es: data.descripcion_es || null,
          descripcion_en: data.descripcion_en || null,
          descripcion_fr: data.descripcion_fr || null,
          descripcion_it: data.descripcion_it || null,
          descripcion_de: data.descripcion_de || null,
          orden: data.orden,
          categoria_complemento_de: data.categoria_complemento_de || null,
          complemento_obligatorio: data.complemento_obligatorio,
          categoria_padre_id: data.categoria_padre_id || null,
        })
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          error.message,
          'repository',
          'SupabaseCategoryRepository.create',
          { empresaId: data.empresaId, details: { code: error.code, hint: error.hint } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al crear categoría', 
            module: 'repository', 
            method: 'create' 
          } 
        };
      }

      return { success: true, data: this.mapToDomain(created) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseCategoryRepository.create', {
        empresaId: data.empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async update(id: string, empresaId: string, data: Partial<UpdateCategoryData>): Promise<Result<Category>> {
    try {
      const updatePayload: Record<string, unknown> = {};

      if (data.nombre_es !== undefined) updatePayload.nombre_es = data.nombre_es;
      if (data.nombre_en !== undefined) updatePayload.nombre_en = data.nombre_en;
      if (data.nombre_fr !== undefined) updatePayload.nombre_fr = data.nombre_fr;
      if (data.nombre_it !== undefined) updatePayload.nombre_it = data.nombre_it;
      if (data.nombre_de !== undefined) updatePayload.nombre_de = data.nombre_de;
      if (data.descripcion_es !== undefined) updatePayload.descripcion_es = data.descripcion_es;
      if (data.descripcion_en !== undefined) updatePayload.descripcion_en = data.descripcion_en;
      if (data.descripcion_fr !== undefined) updatePayload.descripcion_fr = data.descripcion_fr;
      if (data.descripcion_it !== undefined) updatePayload.descripcion_it = data.descripcion_it;
      if (data.descripcion_de !== undefined) updatePayload.descripcion_de = data.descripcion_de;
      if (data.orden !== undefined) updatePayload.orden = data.orden;
      if (data.categoria_complemento_de !== undefined) updatePayload.categoria_complemento_de = data.categoria_complemento_de;
      if (data.complemento_obligatorio !== undefined) updatePayload.complemento_obligatorio = data.complemento_obligatorio;
      if (data.categoria_padre_id !== undefined) updatePayload.categoria_padre_id = data.categoria_padre_id;

      const { data: updated, error } = await this.supabase
        .from("categorias")
        .update(updatePayload)
        .eq("id", id)
        .eq("empresa_id", empresaId)
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseCategoryRepository.update',
          { empresaId, details: { code: error.code, hint: error.hint, categoryId: id } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al actualizar categoría', 
            module: 'repository', 
            method: 'update' 
          } 
        };
      }

      return { success: true, data: this.mapToDomain(updated) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseCategoryRepository.update', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from("categorias")
        .delete()
        .eq("id", id)
        .eq("empresa_id", empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          error.message,
          'repository',
          'SupabaseCategoryRepository.delete',
          { empresaId, details: { code: error.code, hint: error.hint, categoryId: id } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al eliminar categoría', 
            module: 'repository', 
            method: 'delete' 
          } 
        };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseCategoryRepository.delete', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }
}
