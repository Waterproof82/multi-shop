import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import type { Result } from '@/core/domain/entities/types';
import type { AuditEntry } from '../domain/types';
import type { IAuditRepository, CreateAuditEntryInput } from '../domain/interfaces/IAuditRepository';

function mapRow(row: Record<string, unknown>): AuditEntry {
  return {
    id:               row.id as string,
    empresaId:        row.empresa_id as string,
    actorId:          row.actor_id as string,
    actionType:       row.action_type as string,
    entityType:       (row.entity_type as string) ?? null,
    entityId:         (row.entity_id as string) ?? null,
    reason:           (row.reason as string) ?? null,
    metadata:         (row.metadata as Record<string, unknown>) ?? {},
    timestampServidor: new Date(row.timestamp_srv as string),
  };
}

export class SupabaseAuditRepository implements IAuditRepository {
  private get db() { return getSupabaseClient(); }

  async insert(input: CreateAuditEntryInput): Promise<Result<void>> {
    try {
      const { error } = await this.db
        .from('lc_audit_log')
        .insert({
          empresa_id:  input.empresaId,
          actor_id:    input.actorId,
          action_type: input.actionType,
          entity_type: input.entityType ?? null,
          entity_id:   input.entityId ?? null,
          reason:      input.reason ?? null,
          metadata:    input.metadata ?? {},
        });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'insert') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'insert') };
    }
  }

  async findByEmpresa(empresaId: string, limit = 100): Promise<Result<AuditEntry[]>> {
    try {
      const { data, error } = await this.db
        .from('lc_audit_log')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('timestamp_srv', { ascending: false })
        .limit(limit);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findByEmpresa') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findByEmpresa') };
    }
  }
}
