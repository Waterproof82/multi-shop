import { SupabaseClient } from "@supabase/supabase-js";
import { ICategoryRepository, CreateCategoryData, UpdateCategoryData } from "@/core/domain/repositories/ICategoryRepository";
import { Category } from "@/core/domain/entities/types";

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

  async findAllByTenant(empresaId: string): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from("categorias")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error('[CategoryRepo] Error fetching categories:', error.message);
      throw new Error(`DB Error fetching categories: ${error.message}`);
    }

    return data.map((row: Record<string, unknown>) => this.mapToDomain(row));
  }

  async create(data: CreateCategoryData): Promise<Category> {
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

  async update(id: string, empresaId: string, data: Partial<UpdateCategoryData>): Promise<Category> {
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
