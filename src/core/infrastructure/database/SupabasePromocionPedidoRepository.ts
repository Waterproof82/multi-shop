import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface Promocion {
  id: string;
  empresa_id: string;
  fecha_hora: string;
  texto_promocion: string;
  numero_envios: number;
  imagen_url: string | null;
  created_at: string;
}

export interface IPromocionRepository {
  findAllByTenant(empresaId: string): Promise<Promocion[]>;
  create(data: { empresaId: string; texto_promocion: string; imagen_url?: string; numero_envios: number }): Promise<Promocion>;
  deleteAllByTenant(empresaId: string): Promise<void>;
}

export interface IPedidoRepository {
  findAllByTenant(empresaId: string): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  updateStatus(id: string, empresaId: string, estado: string): Promise<void>;
}

export class SupabasePromocionRepository implements IPromocionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Promocion[]> {
    const { data, error } = await this.supabase
      .from('promociones')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(`DB Error: ${error.message}`);
    return data || [];
  }

  async create(data: { empresaId: string; texto_promocion: string; imagen_url?: string; numero_envios: number }): Promise<Promocion> {
    const { data: promo, error } = await this.supabase
      .from('promociones')
      .insert({
        empresa_id: data.empresaId,
        fecha_hora: new Date().toISOString(),
        texto_promocion: data.texto_promocion,
        imagen_url: data.imagen_url || null,
        numero_envios: data.numero_envios,
      })
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return promo;
  }

  async deleteAllByTenant(empresaId: string): Promise<void> {
    const { error } = await this.supabase
      .from('promociones')
      .delete()
      .eq('empresa_id', empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }
}

export class SupabasePedidoRepository implements IPedidoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('pedidos')
      .select(`
        *,
        clientes:cliente_id (nombre, email, telefono)
      `)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`DB Error: ${error.message}`);
    return data || [];
  }

  async findById(id: string): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('pedidos')
      .select(`
        *,
        clientes:cliente_id (nombre, email, telefono)
      `)
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  async updateStatus(id: string, empresaId: string, estado: string): Promise<void> {
    const { error } = await this.supabase
      .from('pedidos')
      .update({ estado })
      .eq('id', id)
      .eq('empresa_id', empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }
}
