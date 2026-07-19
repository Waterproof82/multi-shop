import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IAuditLogRepository } from '@/core/domain/repositories/IAuditLogRepository';
import type { InsertAuditPayload, AuditLogEntry, FindAuditOpts } from '@/core/domain/entities/audit-types';
import type { ActorTipo } from '@/core/domain/entities/audit-types';

const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

function mapRowToEntry(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    actorId: (row.actor_id as string | null) ?? null,
    actorTipo: row.actor_tipo as ActorTipo,
    actorNombre: (row.actor_nombre as string | null) ?? null,
    action: row.action as AuditLogEntry['action'],
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

export class SupabaseAuditLogRepository implements IAuditLogRepository {
  private get supabase() { return getSupabaseClient(); }

  insert(payload: InsertAuditPayload): Promise<void> {
    const row = {
      empresa_id: payload.empresaId,
      actor_id: payload.actorId ?? null,
      actor_tipo: payload.actorTipo,
      actor_nombre: payload.actorNombre ?? null,
      action: payload.action,
      payload: payload.payload,
    };

    // Fire-and-forget: do not await, swallow errors silently
    void Promise.resolve(this.supabase.from('audit_log').insert(row)).then(({ error }) => {
      if (error) {
        console.error('[AuditLogRepository] insert failed', error.message);
        if (globalThis.window === undefined) {
          void import('@sentry/nextjs').then(({ captureException }) => {
            captureException(new Error(`AuditLogRepository.insert failed: ${error.message}`));
          }).catch(() => undefined);
        }
      }
    }).catch((err: unknown) => {
      console.error('[AuditLogRepository] insert threw', err);
    });

    return Promise.resolve();
  }

  async findByEmpresa(
    empresaId: string,
    opts: FindAuditOpts,
  ): Promise<{ items: AuditLogEntry[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit, MIN_LIMIT), MAX_LIMIT);
    const page = Math.max(opts.page, 1);
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    try {
      let query = this.supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (opts.action) {
        query = query.eq('action', opts.action);
      }
      if (opts.actorTipo) {
        query = query.eq('actor_tipo', opts.actorTipo);
      }
      if (opts.fromDate) {
        query = query.gte('created_at', `${opts.fromDate}T00:00:00Z`);
      }
      if (opts.toDate) {
        query = query.lte('created_at', `${opts.toDate}T23:59:59Z`);
      }

      const { data, error, count } = await query;

      if (error) {
        return { items: [], total: 0 };
      }

      const items = (data ?? []).map((row) => mapRowToEntry(row as Record<string, unknown>));
      return { items, total: count ?? 0 };
    } catch {
      return { items: [], total: 0 };
    }
  }
}
