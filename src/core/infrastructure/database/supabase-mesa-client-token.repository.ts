import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/core/domain/entities/types';
import {
  IMesaClientTokenRepository,
  MesaClientToken,
  TokenValidationResult,
} from '@/core/domain/repositories/IMesaClientTokenRepository';
import { logger } from '../logging/logger';

export class SupabaseMesaClientTokenRepository implements IMesaClientTokenRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async issueToken(mesaSesionId: string, expiresAt: Date): Promise<Result<MesaClientToken>> {
    try {
      const { data, error } = await this.supabase
        .from('mesa_client_tokens')
        .insert({ mesa_sesion_id: mesaSesionId, expires_at: expiresAt.toISOString() })
        .select('id, mesa_sesion_id, token, expires_at, created_at')
        .single();

      if (error) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error.message, 'repository', 'SupabaseMesaClientTokenRepository.issueToken', { details: { mesaSesionId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al emitir token', module: 'repository', method: 'issueToken' } };
      }

      const row = data as { id: string; mesa_sesion_id: string; token: string; expires_at: string; created_at: string };
      return {
        success: true,
        data: {
          id: row.id,
          mesaSesionId: row.mesa_sesion_id,
          token: row.token,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaClientTokenRepository.issueToken', { details: { mesaSesionId } });
      return { success: false, error: appError };
    }
  }

  async validateToken(token: string): Promise<Result<TokenValidationResult>> {
    try {
      const { data, error } = await this.supabase
        .from('mesa_client_tokens')
        .select('expires_at, mesa_sesiones!inner(cerrada_at)')
        .eq('token', token)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseMesaClientTokenRepository.validateToken', {});
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al validar token', module: 'repository', method: 'validateToken' } };
      }

      if (!data) {
        return { success: true, data: { valid: false, code: 'NOT_FOUND' } };
      }

      const row = data as { expires_at: string; mesa_sesiones: { cerrada_at: string | null }[] };

      if (row.mesa_sesiones[0]?.cerrada_at !== null) {
        return { success: true, data: { valid: false, code: 'SESSION_CLOSED' } };
      }

      if (new Date(row.expires_at) < new Date()) {
        return { success: true, data: { valid: false, code: 'TOKEN_EXPIRED' } };
      }

      return { success: true, data: { valid: true } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaClientTokenRepository.validateToken', {});
      return { success: false, error: appError };
    }
  }

  async deleteExpired(): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('mesa_client_tokens')
        .delete()
        .lt('expires_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        await logger.logAndReturnError('DB_DELETE_ERROR', error.message, 'repository', 'SupabaseMesaClientTokenRepository.deleteExpired', {});
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al limpiar tokens', module: 'repository', method: 'deleteExpired' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaClientTokenRepository.deleteExpired', {});
      return { success: false, error: appError };
    }
  }
}
