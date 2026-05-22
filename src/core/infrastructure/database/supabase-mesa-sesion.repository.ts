import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/core/domain/entities/types';
import { IMesaSesionRepository, MesaSesion } from '@/core/domain/repositories/IMesaSesionRepository';
import { logger } from '../logging/logger';

export class SupabaseMesaSesionRepository implements IMesaSesionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async openSesion(mesaId: string, empresaId: string): Promise<Result<string>> {
    try {
      const { data, error } = await this.supabase
        .rpc('open_mesa_sesion', { p_mesa_id: mesaId, p_empresa_id: empresaId });

      if (error) {
        await logger.logAndReturnError(
          'DB_RPC_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.openSesion',
          { details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al abrir sesión de mesa', module: 'repository', method: 'openSesion' } };
      }

      const row = data as Record<string, unknown>;
      return { success: true, data: row['id'] as string };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.openSesion', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async closeSesion(sesionId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .rpc('close_mesa_sesion', { p_sesion_id: sesionId });

      if (error) {
        await logger.logAndReturnError(
          'DB_RPC_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.closeSesion',
          { details: { code: error.code, sesionId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al cerrar sesión de mesa', module: 'repository', method: 'closeSesion' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.closeSesion', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }

  async findActiveSesionByMesa(mesaId: string): Promise<Result<MesaSesion | null>> {
    try {
      const { data, error } = await this.supabase
        .from('mesa_sesiones')
        .select('id, mesa_id, empresa_id, total, cerrada_at, created_at')
        .eq('mesa_id', mesaId)
        .is('cerrada_at', null)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.findActiveSesionByMesa',
          { details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar sesión activa', module: 'repository', method: 'findActiveSesionByMesa' } };
      }

      if (!data) return { success: true, data: null };

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          mesaId: row['mesa_id'] as string,
          empresaId: row['empresa_id'] as string,
          total: row['total'] as number,
          cerradaAt: (row['cerrada_at'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.findActiveSesionByMesa', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async findSesionWithOrders(sesionId: string): Promise<Result<MesaSesion | null>> {
    try {
      const { data, error } = await this.supabase
        .from('mesa_sesiones')
        .select('id, mesa_id, empresa_id, total, cerrada_at, created_at')
        .eq('id', sesionId)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.findSesionWithOrders',
          { details: { code: error.code, sesionId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar sesión', module: 'repository', method: 'findSesionWithOrders' } };
      }

      if (!data) return { success: true, data: null };

      const row = data as Record<string, unknown>;
      return {
        success: true,
        data: {
          id: row['id'] as string,
          mesaId: row['mesa_id'] as string,
          empresaId: row['empresa_id'] as string,
          total: row['total'] as number,
          cerradaAt: (row['cerrada_at'] as string | null) ?? null,
          createdAt: row['created_at'] as string,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.findSesionWithOrders', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }
}
