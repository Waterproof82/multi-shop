import type { InsertAuditPayload, AuditLogEntry, FindAuditOpts } from '../entities/audit-types';

export interface IAuditLogRepository {
  insert(payload: InsertAuditPayload): Promise<void>;
  findByEmpresa(empresaId: string, opts: FindAuditOpts): Promise<{ items: AuditLogEntry[]; total: number }>;
}
