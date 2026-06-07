import { Cliente, Result } from "@/core/domain/entities/types";
import { IClienteRepository, CreateClienteData, UpdateClienteData } from "@/core/domain/repositories/IClienteRepository";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logging/logger";

interface ClienteWithPedidos extends Cliente {
  numero_pedidos: number;
}

export class SupabaseClienteRepository implements IClienteRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Result<ClienteWithPedidos[]>> {
    try {
      const { data: clientes, error } = await this.supabase
        .from('clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseClienteRepository.findAllByTenant',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener clientes', module: 'repository', method: 'findAllByTenant' } };
      }

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

      const mapped = clientes?.map(c => ({
        ...c,
        empresaId: c.empresa_id as string,
        idioma: (c as Record<string, unknown>).idioma as string | null,
        numero_pedidos: pedidosCount[c.id] || 0,
      })) ?? [];

      return { success: true, data: mapped.sort((a, b) => b.numero_pedidos - a.numero_pedidos) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseClienteRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findByEmail(email: string, empresaId: string): Promise<Result<Cliente | null>> {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data: cliente } = await this.supabase
        .from('clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .ilike('email', normalizedEmail)
        .single();

      if (!cliente) return { success: true, data: null };
      return { success: true, data: { ...cliente, empresaId: cliente.empresa_id, idioma: (cliente as Record<string, unknown>).idioma as string | null } };
    } catch (e) {
      // Not found is not an error
      if (e instanceof Object && 'code' in e && e.code === 'PGRST116') {
        return { success: true, data: null };
      }
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseClienteRepository.findByEmail', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findByTelefono(telefono: string, empresaId: string): Promise<Result<Cliente | null>> {
    try {
      const { data: cliente, error } = await this.supabase
        .from('clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('telefono', telefono)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: true, data: null };
        }
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseClienteRepository.findByTelefono',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar cliente', module: 'repository', method: 'findByTelefono' } };
      }
      return { success: true, data: { ...cliente, empresaId: cliente.empresa_id, idioma: (cliente as Record<string, unknown>).idioma as string | null } };
    } catch (e) {
      if (e instanceof Object && 'code' in e && e.code === 'PGRST116') {
        return { success: true, data: null };
      }
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseClienteRepository.findByTelefono', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateClienteData): Promise<Result<Cliente>> {
    try {
      const { data: cliente, error } = await this.supabase
        .from('clientes')
        .insert({
          empresa_id: data.empresaId,
          nombre: data.nombre || null,
          email: data.email || null,
          telefono: data.telefono || null,
          direccion: data.direccion || null,
          idioma: data.idioma || 'es',
          aceptar_promociones: false,
        })
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          error.message,
          'repository',
          'SupabaseClienteRepository.create',
          { empresaId: data.empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear cliente', module: 'repository', method: 'create' } };
      }
      return { success: true, data: { ...cliente, empresaId: cliente.empresa_id, idioma: (cliente as Record<string, unknown>).idioma as string | null } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseClienteRepository.create', { empresaId: data.empresaId });
      return { success: false, error: appError };
    }
  }

  async update(id: string, empresaId: string, data: Partial<UpdateClienteData>): Promise<Result<Cliente>> {
    try {
      const updatePayload: Record<string, unknown> = {};
      if (data.nombre !== undefined) updatePayload.nombre = data.nombre;
      if (data.email !== undefined) updatePayload.email = data.email || null;
      if (data.telefono !== undefined) updatePayload.telefono = data.telefono;
      if (data.direccion !== undefined) updatePayload.direccion = data.direccion;
      if (data.aceptar_promociones !== undefined) updatePayload.aceptar_promociones = data.aceptar_promociones;
      if (data.idioma !== undefined) updatePayload.idioma = data.idioma;

      const { data: updated, error } = await this.supabase
        .from('clientes')
        .update(updatePayload)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseClienteRepository.update',
          { empresaId, details: { code: error.code, clienteId: id } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar cliente', module: 'repository', method: 'update' } };
      }
      return { success: true, data: { ...updated, empresaId: updated.empresa_id } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseClienteRepository.update', { empresaId });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('clientes')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          error.message,
          'repository',
          'SupabaseClienteRepository.delete',
          { empresaId, details: { code: error.code, clienteId: id } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar cliente', module: 'repository', method: 'delete' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseClienteRepository.delete', { empresaId });
      return { success: false, error: appError };
    }
  }
}
