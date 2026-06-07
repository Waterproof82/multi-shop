import { SupabaseClient } from '@supabase/supabase-js';
import { CodigoDescuento, Result } from '@/core/domain/entities/types';
import { ICodigoDescuentoRepository, CreateCodigoDescuentoData } from '@/core/domain/repositories/ICodigoDescuentoRepository';
import { logger } from '../logging/logger';

function mapRow(row: Record<string, unknown>): CodigoDescuento {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    clienteEmail: row.cliente_email as string,
    codigo: row.codigo as string,
    porcentajeDescuento: Number(row.porcentaje_descuento),
    fechaExpiracion: row.fecha_expiracion as string,
    usado: row.usado as boolean,
    pedidoId: (row.pedido_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export class SupabaseDescuentoRepository implements ICodigoDescuentoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(data: CreateCodigoDescuentoData): Promise<Result<CodigoDescuento>> {
    try {
      const { data: row, error } = await this.supabase
        .from('codigos_descuento')
        .insert({
          empresa_id: data.empresaId,
          cliente_email: data.clienteEmail.toLowerCase(),
          codigo: data.codigo,
          porcentaje_descuento: data.porcentajeDescuento,
          fecha_expiracion: data.fechaExpiracion.toISOString(),
        })
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error.message, 'repository', 'SupabaseDescuentoRepository.create', { details: { code: error.code } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear código de descuento', module: 'repository', method: 'create' } };
      }

      return { success: true, data: mapRow(row as Record<string, unknown>) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseDescuentoRepository.create');
      return { success: false, error: appError };
    }
  }

  async findByCodigo(codigo: string, empresaId: string): Promise<Result<CodigoDescuento | null>> {
    try {
      const { data: row, error } = await this.supabase
        .from('codigos_descuento')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('codigo', codigo)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseDescuentoRepository.findByCodigo', { details: { code: error.code } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar código', module: 'repository', method: 'findByCodigo' } };
      }

      return { success: true, data: row ? mapRow(row as Record<string, unknown>) : null };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseDescuentoRepository.findByCodigo');
      return { success: false, error: appError };
    }
  }

  async findByEmail(email: string, empresaId: string): Promise<Result<CodigoDescuento | null>> {
    try {
      const { data: row, error } = await this.supabase
        .from('codigos_descuento')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('cliente_email', email.toLowerCase())
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseDescuentoRepository.findByEmail', { details: { code: error.code } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar código', module: 'repository', method: 'findByEmail' } };
      }

      return { success: true, data: row ? mapRow(row as Record<string, unknown>) : null };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseDescuentoRepository.findByEmail');
      return { success: false, error: appError };
    }
  }

  async markAsUsed(id: string, pedidoId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('codigos_descuento')
        .update({ usado: true, pedido_id: pedidoId })
        .eq('id', id);

      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', 'SupabaseDescuentoRepository.markAsUsed', { details: { code: error.code, id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al marcar código como usado', module: 'repository', method: 'markAsUsed' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseDescuentoRepository.markAsUsed');
      return { success: false, error: appError };
    }
  }
}
