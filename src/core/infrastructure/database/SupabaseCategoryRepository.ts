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
      nombre: row.nombre_es, // Por ahora devolvemos ES por defecto
      orden: row.orden || 0,
      translations: {
        en: row.nombre_en,
        fr: row.nombre_fr,
        it: row.nombre_it,
        de: row.nombre_de,
      },
    }));
  }
}
