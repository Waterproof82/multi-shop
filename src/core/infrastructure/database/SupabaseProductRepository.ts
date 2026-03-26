import { SupabaseClient } from "@supabase/supabase-js";
import { IProductRepository, CreateProductData, UpdateProductData } from "@/core/domain/repositories/IProductRepository";
import { Product, Result } from "@/core/domain/entities/types";
import { logger } from "../logging/logger";

export class SupabaseProductRepository implements IProductRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapToDomain(row: Record<string, unknown>): Product {
    return {
      id: row.id as string,
      empresaId: row.empresa_id as string,
      categoriaId: row.categoria_id as string | null,
      titulo_es: row.titulo_es as string,
      titulo_en: row.titulo_en as string | null,
      titulo_fr: row.titulo_fr as string | null,
      titulo_it: row.titulo_it as string | null,
      titulo_de: row.titulo_de as string | null,
      descripcion_es: row.descripcion_es as string | null,
      descripcion_en: row.descripcion_en as string | null,
      descripcion_fr: row.descripcion_fr as string | null,
      descripcion_it: row.descripcion_it as string | null,
      descripcion_de: row.descripcion_de as string | null,
      precio: Number.parseFloat(row.precio as string),
      fotoUrl: row.foto_url as string | null,
      esEspecial: row.es_especial as boolean,
      activo: row.activo as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }

  async create(data: CreateProductData): Promise<Result<Product>> {
    try {
      const { data: created, error } = await this.supabase
        .from("productos")
        .insert({
          empresa_id: data.empresaId,
          categoria_id: data.categoria_id || null,
          titulo_es: data.titulo_es,
          titulo_en: data.titulo_en || null,
          titulo_fr: data.titulo_fr || null,
          titulo_it: data.titulo_it || null,
          titulo_de: data.titulo_de || null,
          descripcion_es: data.descripcion_es || null,
          descripcion_en: data.descripcion_en || null,
          descripcion_fr: data.descripcion_fr || null,
          descripcion_it: data.descripcion_it || null,
          descripcion_de: data.descripcion_de || null,
          precio: data.precio,
          foto_url: data.foto_url || null,
          es_especial: data.es_especial,
          activo: data.activo,
        })
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          error.message,
          'repository',
          'SupabaseProductRepository.create',
          { empresaId: data.empresaId, details: { code: error.code, hint: error.hint } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al crear producto', 
            module: 'repository', 
            method: 'create' 
          } 
        };
      }

      return { success: true, data: this.mapToDomain(created) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseProductRepository.create', {
        empresaId: data.empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async findByIds(ids: string[], empresaId: string): Promise<Result<Product[]>> {
    try {
      if (ids.length === 0) return { success: true, data: [] };

      const { data, error } = await this.supabase
        .from("productos")
        .select("id, precio, empresa_id")
        .in("id", ids)
        .eq("empresa_id", empresaId)
        .eq("activo", true);

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseProductRepository.findByIds',
          { empresaId, details: { code: error.code, hint: error.hint } }
        );
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Error al obtener productos por IDs',
            module: 'repository',
            method: 'findByIds',
          },
        };
      }

      return { success: true, data: data.map((row: Record<string, unknown>) => this.mapToDomain(row)) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseProductRepository.findByIds', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async findAllByTenant(empresaId: string): Promise<Result<Product[]>> {
    try {
      const { data, error } = await this.supabase
        .from("productos")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseProductRepository.findAllByTenant',
          { empresaId, details: { code: error.code, hint: error.hint } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al obtener productos', 
            module: 'repository', 
            method: 'findAllByTenant' 
          } 
        };
      }

      return { success: true, data: data.map((row: Record<string, unknown>) => this.mapToDomain(row)) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseProductRepository.findAllByTenant', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  private mapUpdateProductPayload(data: Partial<UpdateProductData>): Record<string, unknown> {
    const updatePayload: Record<string, unknown> = {};
    const fieldsToMap = [
      'categoria_id', 'titulo_es', 'titulo_en', 'titulo_fr', 'titulo_it', 'titulo_de',
      'descripcion_es', 'descripcion_en', 'descripcion_fr', 'descripcion_it', 'descripcion_de',
      'precio', 'es_especial', 'activo'
    ];

    for (const field of fieldsToMap) {
      if (data[field as keyof UpdateProductData] !== undefined) {
        updatePayload[field] = data[field as keyof UpdateProductData];
      }
    }

    if (data.foto_url !== undefined) {
      updatePayload.foto_url = data.foto_url === "" ? null : data.foto_url;
    }

    return updatePayload;
  }

  async update(id: string, empresaId: string, data: Partial<UpdateProductData>): Promise<Result<Product>> {
    try {
      const updatePayload = this.mapUpdateProductPayload(data);

      const { data: updated, error } = await this.supabase
        .from("productos")
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
          'SupabaseProductRepository.update',
          { empresaId, details: { code: error.code, hint: error.hint, productId: id } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al actualizar producto', 
            module: 'repository', 
            method: 'update' 
          } 
        };
      }

      return { success: true, data: this.mapToDomain(updated) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseProductRepository.update', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from("productos")
        .delete()
        .eq("id", id)
        .eq("empresa_id", empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          error.message,
          'repository',
          'SupabaseProductRepository.delete',
          { empresaId, details: { code: error.code, hint: error.hint, productId: id } }
        );
        return { 
          success: false, 
          error: { 
            code: 'DB_ERROR', 
            message: 'Error al eliminar producto', 
            module: 'repository', 
            method: 'delete' 
          } 
        };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseProductRepository.delete', {
        empresaId,
      });
      return { success: false, error: appError };
    }
  }
}
