import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import type { Result } from '@/core/domain/entities/types';
import type { LegalHold } from '../domain/types';
import type { IHoldRepository, CreateHoldInput } from '../domain/interfaces/IHoldRepository';

function mapRow(row: Record<string, unknown>): LegalHold {
  return {
    id:           row.id as string,
    empresaId:    row.empresa_id as string,
    empleadoId:   (row.empleado_id as string) ?? null,
    fechaInicio:  row.fecha_inicio as string,
    fechaFin:     row.fecha_fin as string,
    motivo:       row.motivo as string,
    actorId:      row.actor_id as string,
    activo:       row.activo as boolean,
    createdAt:    new Date(row.created_at as string),
    liftedAt:     row.lifted_at ? new Date(row.lifted_at as string) : null,
  };
}

export class SupabaseHoldRepository implements IHoldRepository {
  private get db() { return getSupabaseClient(); }

  async create(input: CreateHoldInput): Promise<Result<LegalHold>> {
    try {
      const { data, error } = await this.db
        .from('lc_legal_holds')
        .insert({
          empresa_id:   input.empresaId,
          empleado_id:  input.empleadoId ?? null,
          fecha_inicio: input.fechaInicio,
          fecha_fin:    input.fechaFin,
          motivo:       input.motivo,
          actor_id:     input.actorId,
        })
        .select()
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'create') };
      return { success: true, data: mapRow(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'create') };
    }
  }

  async findByEmpresa(empresaId: string): Promise<Result<LegalHold[]>> {
    try {
      const { data, error } = await this.db
        .from('lc_legal_holds')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findByEmpresa') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findByEmpresa') };
    }
  }

  async lift(id: string, empresaId: string, actorId: string): Promise<Result<void>> {
    try {
      const { error } = await this.db
        .from('lc_legal_holds')
        .update({ activo: false, lifted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('empresa_id', empresaId);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'lift') };
      void actorId; // audit logged by use case
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'lift') };
    }
  }

  async hasActiveHold(empresaId: string, empleadoId?: string): Promise<Result<boolean>> {
    try {
      let query = this.db
        .from('lc_legal_holds')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('activo', true);
      if (empleadoId) {
        query = query.or(`empleado_id.eq.${empleadoId},empleado_id.is.null`);
      }
      const { data, error } = await query.limit(1);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'hasActiveHold') };
      return { success: true, data: (data ?? []).length > 0 };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'hasActiveHold') };
    }
  }
}
