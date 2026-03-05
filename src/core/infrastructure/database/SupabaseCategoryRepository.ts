import { SupabaseClient } from "@supabase/supabase-js";
import { ICategoryRepository } from "@/core/domain/repositories/ICategoryRepository";
import { Category } from "@/core/domain/entities/types";
import { CreateCategoryDTO, UpdateCategoryDTO } from "@/core/application/dtos/category.dto";

export class SupabaseCategoryRepository implements ICategoryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapToDomain(row: any): Category {
    return {
      id: row.id,
      empresaId: row.empresa_id,
      nombre: row.nombre_es,
      descripcion: row.descripcion_es || null,
      orden: row.orden || 0,
      categoriaComplementoDe: row.categoria_complemento_de || null,
      complementoObligatorio: row.complemento_obligatorio || false,
      categoriaPadreId: row.categoria_padre_id || null,
      translations: {
        en: row.nombre_en,
        fr: row.nombre_fr,
        it: row.nombre_it,
        de: row.nombre_de,
      },
      descripcionTranslations: {
        en: row.descripcion_en,
        fr: row.descripcion_fr,
        it: row.descripcion_it,
        de: row.descripcion_de,
      },
    };
  }

  async findAllByTenant(empresaId: string): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from("categorias")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("orden", { ascending: true });

    if (error) throw new Error(`DB Error fetching categories: ${error.message}`);

    return data.map((row: any) => this.mapToDomain(row));
  }

  async create(data: CreateCategoryDTO): Promise<Category> {
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

    if (error) throw new Error(`DB Error: ${error.message}`);
    return this.mapToDomain(created);
  }

  async update(id: string, empresaId: string, data: Partial<UpdateCategoryDTO>): Promise<Category> {
    const updatePayload: any = {};
    
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

    if (error) throw new Error(`DB Error: ${error.message}`);
    return this.mapToDomain(updated);
  }

  async delete(id: string, empresaId: string): Promise<void> {
    const { error } = await this.supabase
      .from("categorias")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }
}
