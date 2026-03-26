import { SupabaseClient } from "@supabase/supabase-js";
import { Promocion, Result } from "@/core/domain/entities/types";
import { IPromocionRepository } from "@/core/domain/repositories/IPromocionRepository";
import { logger } from "../logging/logger";

export class SupabasePromocionRepository implements IPromocionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Result<Promocion[]>> {
    try {
      const { data, error } = await this.supabase
        .from('promociones')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabasePromocionRepository.findAllByTenant',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener promociones', module: 'repository', method: 'findAllByTenant' } };
      }
      return { success: true, data: data || [] };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePromocionRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(data: { empresaId: string; texto_promocion: string; imagen_url?: string; numero_envios: number }): Promise<Result<Promocion>> {
    try {
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

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR',
          error.message,
          'repository',
          'SupabasePromocionRepository.create',
          { empresaId: data.empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear promoción', module: 'repository', method: 'create' } };
      }
      return { success: true, data: promo };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePromocionRepository.create', { empresaId: data.empresaId });
      return { success: false, error: appError };
    }
  }

  async deleteAllByTenant(empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('promociones')
        .delete()
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR',
          error.message,
          'repository',
          'SupabasePromocionRepository.deleteAllByTenant',
          { empresaId, details: { code: error.code } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar promociones', module: 'repository', method: 'deleteAllByTenant' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePromocionRepository.deleteAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }
}
