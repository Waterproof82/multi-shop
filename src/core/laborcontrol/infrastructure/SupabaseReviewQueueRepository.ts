import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import type { Result } from '@/core/domain/entities/types';
import type { ReviewQueueItem, ReviewEstado } from '../domain/types';
import type { IReviewQueueRepository, CreateReviewItemInput } from '../domain/interfaces/IReviewQueueRepository';

function mapRow(row: Record<string, unknown>): ReviewQueueItem {
  return {
    id:            row.id as string,
    empresaId:     row.empresa_id as string,
    centroId:      row.centro_id as string,
    empleadoId:    row.empleado_id as string,
    recordId:      (row.record_id as string) ?? null,
    tipoRevision:  row.tipo_revision as ReviewQueueItem['tipoRevision'],
    estado:        row.estado as ReviewEstado,
    detalle:       (row.detalle as Record<string, unknown>) ?? {},
    createdAt:     new Date(row.created_at as string),
    updatedAt:     new Date(row.updated_at as string),
    resolvedAt:    row.resolved_at ? new Date(row.resolved_at as string) : null,
    resolvedBy:    (row.resolved_by as string) ?? null,
  };
}

export class SupabaseReviewQueueRepository implements IReviewQueueRepository {
  private get db() { return getSupabaseClient(); }

  async create(input: CreateReviewItemInput): Promise<Result<ReviewQueueItem>> {
    try {
      const { data, error } = await this.db
        .from('lc_review_queue')
        .insert({
          empresa_id:     input.empresaId,
          centro_id:      input.centroId,
          empleado_id:    input.empleadoId,
          record_id:      input.recordId ?? null,
          tipo_revision:  input.tipoRevision,
          detalle:        input.detalle ?? {},
        })
        .select()
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'reviewQueue.create') };
      return { success: true, data: mapRow(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'reviewQueue.create') };
    }
  }

  async findByEmpleado(empresaId: string, empleadoId: string): Promise<Result<ReviewQueueItem[]>> {
    try {
      const { data, error } = await this.db
        .from('lc_review_queue')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('empleado_id', empleadoId)
        .order('created_at', { ascending: false });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'reviewQueue.findByEmpleado') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'reviewQueue.findByEmpleado') };
    }
  }

  async findPendientesByEmpresa(empresaId: string): Promise<Result<ReviewQueueItem[]>> {
    try {
      const { data, error } = await this.db
        .from('lc_review_queue')
        .select('*')
        .eq('empresa_id', empresaId)
        .in('estado', ['pendiente', 'disputado'])
        .order('created_at', { ascending: false });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'reviewQueue.findPendientes') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'reviewQueue.findPendientes') };
    }
  }

  async updateEstado(id: string, estado: ReviewEstado, resolvedBy?: string): Promise<Result<void>> {
    try {
      const patch: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
      if (estado === 'resuelto' || estado === 'visto') {
        patch.resolved_at = new Date().toISOString();
        if (resolvedBy) patch.resolved_by = resolvedBy;
      }
      const { error } = await this.db
        .from('lc_review_queue')
        .update(patch)
        .eq('id', id);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'reviewQueue.updateEstado') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'reviewQueue.updateEstado') };
    }
  }
}
