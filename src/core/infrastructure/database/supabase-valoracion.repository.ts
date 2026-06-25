import { SupabaseClient } from '@supabase/supabase-js';
import { Result, Valoracion, ValoracionStats } from '@/core/domain/entities/types';
import { CreateValoracionData, IValoracionRepository } from '@/core/domain/repositories/IValoracionRepository';
import { logger } from '../logging/logger';

export class SupabaseValoracionRepository implements IValoracionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(data: CreateValoracionData): Promise<Result<Valoracion>> {
    try {
      const { data: row, error } = await this.supabase
        .from('valoraciones')
        .upsert(
          {
            empresa_id: data.empresaId,
            mesa_id: data.mesaId,
            mesa_sesion_id: data.mesaSesionId,
            rater_id: data.raterId,
            estrellas: data.estrellas,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'mesa_sesion_id,rater_id', ignoreDuplicates: false }
        )
        .select('id, empresa_id, mesa_id, mesa_sesion_id, rater_id, estrellas, created_at')
        .single();

      if (error) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error.message, 'repository', 'SupabaseValoracionRepository.create', { details: data });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al guardar la valoración', module: 'repository', method: 'create' } };
      }

      const r = row as { id: string; empresa_id: string; mesa_id: string | null; mesa_sesion_id: string | null; rater_id: string; estrellas: number; created_at: string };
      return {
        success: true,
        data: {
          id: r.id,
          empresaId: r.empresa_id,
          mesaId: r.mesa_id,
          mesaSesionId: r.mesa_sesion_id,
          raterId: r.rater_id,
          estrellas: Number(r.estrellas),
          createdAt: r.created_at,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseValoracionRepository.create', { details: data });
      return { success: false, error: appError };
    }
  }

  async getStatsByEmpresa(empresaId: string): Promise<Result<ValoracionStats>> {
    try {
      const { data, error } = await this.supabase
        .from('valoraciones')
        .select('estrellas')
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseValoracionRepository.getStatsByEmpresa', { details: { empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener estadísticas', module: 'repository', method: 'getStatsByEmpresa' } };
      }

      const rows = (data ?? []) as { estrellas: number }[];
      const total = rows.length;
      const media = total > 0 ? rows.reduce((s, r) => s + Number(r.estrellas), 0) / total : 0;

      const distribucion: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      for (const r of rows) {
        const bucket = String(Math.ceil(Number(r.estrellas)));
        if (bucket in distribucion) distribucion[bucket]++;
      }

      return { success: true, data: { media: Math.round(media * 10) / 10, total, distribucion } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseValoracionRepository.getStatsByEmpresa', { details: { empresaId } });
      return { success: false, error: appError };
    }
  }

  async listByEmpresa(empresaId: string, limit: number, offset: number): Promise<Result<Valoracion[]>> {
    try {
      const { data, error } = await this.supabase
        .from('valoraciones')
        .select('id, empresa_id, mesa_id, mesa_sesion_id, rater_id, estrellas, created_at')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseValoracionRepository.listByEmpresa', { details: { empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al listar valoraciones', module: 'repository', method: 'listByEmpresa' } };
      }

      const rows = (data ?? []) as { id: string; empresa_id: string; mesa_id: string | null; mesa_sesion_id: string | null; rater_id: string; estrellas: number; created_at: string }[];
      return {
        success: true,
        data: rows.map(r => ({
          id: r.id,
          empresaId: r.empresa_id,
          mesaId: r.mesa_id,
          mesaSesionId: r.mesa_sesion_id,
          raterId: r.rater_id,
          estrellas: Number(r.estrellas),
          createdAt: r.created_at,
        })),
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseValoracionRepository.listByEmpresa', { details: { empresaId } });
      return { success: false, error: appError };
    }
  }
}
