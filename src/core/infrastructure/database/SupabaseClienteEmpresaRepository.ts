import { IAdminRepository } from "@/core/domain/repositories/IAdminRepository";
import { Empresa } from "@/core/domain/entities/types";
import { UpdateEmpresaDTO } from "@/core/application/dtos/empresa.dto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export interface Cliente {
  id: string;
  empresaId: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  aceptar_promociones: boolean | null;
  created_at: string;
}

export interface IClienteRepository {
  findAllByTenant(empresaId: string): Promise<Cliente[]>;
  create(data: { empresaId: string; nombre?: string; email?: string; telefono?: string; direccion?: string }): Promise<Cliente>;
  update(id: string, empresaId: string, data: Partial<UpdateEmpresaDTO & { nombre?: string; email?: string; telefono?: string; direccion?: string; aceptar_promociones?: boolean }>): Promise<void>;
  delete(id: string, empresaId: string): Promise<void>;
}

export class SupabaseClienteRepository implements IClienteRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Cliente[]> {
    const { data: clientes, error } = await this.supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`DB Error: ${error.message}`);

    // Get pedido counts
    const { data: pedidos } = await this.supabase
      .from('pedidos')
      .select('cliente_id')
      .eq('empresa_id', empresaId);

    const pedidosCount: Record<string, number> = {};
    pedidos?.forEach(p => {
      if (p.cliente_id) {
        pedidosCount[p.cliente_id] = (pedidosCount[p.cliente_id] || 0) + 1;
      }
    });

    return clientes?.map(c => ({
      ...c,
      numero_pedidos: pedidosCount[c.id] || 0
    })).sort((a: any, b: any) => b.numero_pedidos - a.numero_pedidos) || [];
  }

  async create(data: { empresaId: string; nombre?: string; email?: string; telefono?: string; direccion?: string }): Promise<Cliente> {
    const { data: cliente, error } = await this.supabase
      .from('clientes')
      .insert({
        empresa_id: data.empresaId,
        nombre: data.nombre || null,
        email: data.email || null,
        telefono: data.telefono || null,
        direccion: data.direccion || null,
        aceptar_promociones: false,
      })
      .select()
      .single();

    if (error) throw new Error(`DB Error: ${error.message}`);
    return cliente;
  }

  async update(id: string, empresaId: string, data: Partial<{ nombre?: string; email?: string; telefono?: string; direccion?: string; aceptar_promociones?: boolean }>): Promise<void> {
    const updatePayload: Record<string, unknown> = {};
    if (data.nombre !== undefined) updatePayload.nombre = data.nombre;
    if (data.email !== undefined) updatePayload.email = data.email || null;
    if (data.telefono !== undefined) updatePayload.telefono = data.telefono;
    if (data.direccion !== undefined) updatePayload.direccion = data.direccion;
    if (data.aceptar_promociones !== undefined) updatePayload.aceptar_promociones = data.aceptar_promociones;

    const { error } = await this.supabase
      .from('clientes')
      .update(updatePayload)
      .eq('id', id)
      .eq('empresa_id', empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }

  async delete(id: string, empresaId: string): Promise<void> {
    const { error } = await this.supabase
      .from('clientes')
      .delete()
      .eq('id', id)
      .eq('empresa_id', empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }
}

// Empresa Repository
export interface IEmpresaRepository {
  getById(empresaId: string): Promise<Partial<Empresa> | null>;
  update(empresaId: string, data: UpdateEmpresaDTO): Promise<void>;
}

export class SupabaseEmpresaRepository implements IEmpresaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getById(empresaId: string): Promise<Partial<Empresa> | null> {
    const { data: empresa } = await this.supabase
      .from('empresas')
      .select('email_notification, telefono_whatsapp, nombre, logo_url, fb, instagram, url_mapa, direccion')
      .eq('id', empresaId)
      .single();

    if (!empresa) return null;

    return {
      id: empresaId,
      nombre: empresa.nombre,
      dominio: '',
      logoUrl: empresa.logo_url,
      mostrarCarrito: false,
      moneda: 'EUR',
      emailNotification: empresa.email_notification,
      colores: null,
      descripcion: null,
    };
  }

  async update(empresaId: string, data: UpdateEmpresaDTO): Promise<void> {
    const updatePayload: Record<string, unknown> = {};
    if (data.email_notification !== undefined) updatePayload.email_notification = data.email_notification || null;
    if (data.telefono_whatsapp !== undefined) updatePayload.telefono_whatsapp = data.telefono_whatsapp || null;
    if (data.fb !== undefined) updatePayload.fb = data.fb || null;
    if (data.instagram !== undefined) updatePayload.instagram = data.instagram || null;
    if (data.url_mapa !== undefined) updatePayload.url_mapa = data.url_mapa || null;
    if (data.direccion !== undefined) updatePayload.direccion = data.direccion || null;

    const { error } = await this.supabase
      .from('empresas')
      .update(updatePayload)
      .eq('id', empresaId);

    if (error) throw new Error(`DB Error: ${error.message}`);
  }
}
