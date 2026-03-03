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
      titulo: row.titulo_es, // Por ahora ES por defecto
      descripcion: row.descripcion_es,
      precio: Number.parseFloat(row.precio),
      fotoUrl: row.foto_url,
      esEspecial: row.es_especial,
      activo: row.activo,
      createdAt: new Date(row.created_at),
      translations: {
        en: { titulo: row.titulo_en, descripcion: row.descripcion_en },
        fr: { titulo: row.titulo_fr, descripcion: row.descripcion_fr },
        it: { titulo: row.titulo_it, descripcion: row.descripcion_it },
        de: { titulo: row.titulo_de, descripcion: row.descripcion_de },
      },
    };
  }

  async create(data: CreateProductDTO): Promise<Product> {
    const { data: created, error } = await this.supabase
      .from("productos")
      .insert({
        empresa_id: data.empresaId,
        categoria_id: data.categoriaId,
        titulo_es: data.titulo,
        descripcion_es: data.descripcion,
        precio: data.precio,
        foto_url: data.fotoUrl,
        es_especial: data.esEspecial,
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
      .eq("activo", true); // Solo productos activos

    if (error) throw new Error(`DB Error: ${error.message}`);
    return data.map((row) => this.mapToDomain(row));
  }

  async update(id: string, data: Partial<UpdateProductDTO>): Promise<Product> {
    const updatePayload: any = {};
    if (data.categoriaId !== undefined) updatePayload.categoria_id = data.categoriaId;
    if (data.titulo !== undefined) updatePayload.titulo_es = data.titulo;
    if (data.descripcion !== undefined) updatePayload.descripcion_es = data.descripcion;
    if (data.precio !== undefined) updatePayload.precio = data.precio;
    if (data.fotoUrl !== undefined) updatePayload.foto_url = data.fotoUrl;
    if (data.esEspecial !== undefined) updatePayload.es_especial = data.esEspecial;
    if (data.activo !== undefined) updatePayload.activo = data.activo;

    const { data: updated, error } = await this.supabase
      .from("productos")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return this.mapToDomain(updated);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("productos")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }
}