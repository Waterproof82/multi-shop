import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ILandingSeccionRepository,
  UpsertLandingSeccionData,
} from '@/core/domain/repositories/ILandingSeccionRepository';
import type { LandingSeccion, LandingSeccionTipo, Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

export class SupabaseLandingSeccionRepository implements ILandingSeccionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapRow(row: Record<string, unknown>): LandingSeccion {
    return {
      id: row.id as string,
      empresaId: row.empresa_id as string,
      tipo: row.tipo as LandingSeccionTipo,
      activo: row.activo as boolean,
      orden: (row.orden as number) ?? 0,
      contenido: (row.contenido as Record<string, unknown>) ?? {},
    };
  }

  async findAllByTenant(empresaId: string): Promise<Result<LandingSeccion[]>> {
    try {
      const { data, error } = await this.supabase
        .from('empresa_landing_secciones')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseLandingSeccionRepository.findAllByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener secciones de landing', module: 'repository', method: 'findAllByTenant' } };
      }

      return { success: true, data: ((data ?? []) as Record<string, unknown>[]).map(r => this.mapRow(r)) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseLandingSeccionRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async upsertByTipo(empresaId: string, tipo: LandingSeccionTipo, data: UpsertLandingSeccionData): Promise<Result<LandingSeccion>> {
    try {
      const { data: upserted, error } = await this.supabase
        .from('empresa_landing_secciones')
        .upsert(
          {
            empresa_id: empresaId,
            tipo,
            activo: data.activo,
            orden: data.orden,
            contenido: data.contenido,
          },
          { onConflict: 'empresa_id,tipo' }
        )
        .select()
        .single();

      if (error || !upserted) {
        await logger.logAndReturnError('DB_UPSERT_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseLandingSeccionRepository.upsertByTipo', { empresaId, details: { tipo } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al guardar la sección de landing', module: 'repository', method: 'upsertByTipo' } };
      }

      return { success: true, data: this.mapRow(upserted as Record<string, unknown>) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseLandingSeccionRepository.upsertByTipo', { empresaId, details: { tipo } });
      return { success: false, error: appError };
    }
  }
}
