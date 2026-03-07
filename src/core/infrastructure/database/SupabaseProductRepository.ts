import { SupabaseClient } from "@supabase/supabase-js";
import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { Product } from "@/core/domain/entities/types";
import { CreateProductDTO, UpdateProductDTO } from "@/core/application/dtos/product.dto";

export class SupabaseProductRepository implements IProductRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapToDomain(row: any): Product {
    return {
      id: row.id,
      empresaId: row.empresa_id,
      categoriaId: row.categoria_id,
      titulo_es: row.titulo_es,
      titulo_en: row.titulo_en,
      titulo_fr: row.titulo_fr,
      titulo_it: row.titulo_it,
      titulo_de: row.titulo_de,
      descripcion_es: row.descripcion_es,
      descripcion_en: row.descripcion_en,
      descripcion_fr: row.descripcion_fr,
      descripcion_it: row.descripcion_it,
      descripcion_de: row.descripcion_de,
      precio: Number.parseFloat(row.precio),
      fotoUrl: row.foto_url,
      esEspecial: row.es_especial,
      activo: row.activo,
      createdAt: new Date(row.created_at),
    };
  }

  async create(data: CreateProductDTO): Promise<Product> {
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

    if (error) throw new Error(`DB Error: ${error.message}`);
    return this.mapToDomain(created);
  }

  async findById(id: string): Promise<Product | null> {
    const { data, error } = await this.supabase
      .from("productos")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return this.mapToDomain(data);
  }

  async findAllByTenant(empresaId: string): Promise<Product[]> {
    const { data, error } = await this.supabase
      .from("productos")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`DB Error: ${error.message}`);

    // Return domain format (camelCase)
    return data.map((row: any) => this.mapToDomain(row));
  }

  private mapUpdateProductPayload(data: Partial<UpdateProductDTO>): any {
    const updatePayload: any = {};
    const fieldsToMap = [
      'categoria_id', 'titulo_es', 'titulo_en', 'titulo_fr', 'titulo_it', 'titulo_de',
      'descripcion_es', 'descripcion_en', 'descripcion_fr', 'descripcion_it', 'descripcion_de',
      'precio', 'es_especial', 'activo'
    ];

    for (const field of fieldsToMap) {
      if (data[field as keyof UpdateProductDTO] !== undefined) {
        updatePayload[field] = data[field as keyof UpdateProductDTO];
      }
    }

    // Special handling for foto_url as it can be an empty string
    if (data.foto_url !== undefined) {
      updatePayload.foto_url = data.foto_url === "" ? null : data.foto_url;
    }

    return updatePayload;
  }

  async update(id: string, empresaId: string, data: Partial<UpdateProductDTO>): Promise<Product> {
    const updatePayload = this.mapUpdateProductPayload(data);

    const { data: updated, error } = await this.supabase
      .from("productos")
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
      .from("productos")
      .delete()
      .eq("id", id)
      .eq("empresa_id", empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }
}
