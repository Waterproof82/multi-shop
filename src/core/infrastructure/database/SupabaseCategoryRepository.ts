import { SupabaseClient } from "@supabase/supabase-js";
import { ICategoryRepository } from "@/core/domain/repositories/ICategoryRepository";
import { Category } from "@/core/domain/entities/types";

export class SupabaseCategoryRepository implements ICategoryRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from("categorias")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("orden", { ascending: true });

    if (error) throw new Error(`DB Error fetching categories: ${error.message}`);

    return data.map((row: any) => ({
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
    }));
  }
}
