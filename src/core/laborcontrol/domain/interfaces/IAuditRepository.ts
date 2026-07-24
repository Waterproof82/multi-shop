import type { Result } from '@/core/domain/entities/types';
import type { AuditEntry } from '../types';

export interface CreateAuditEntryInput {
  empresaId: string;
  actorId: string;
  actionType: string;
  entityType?: string;
  entityId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface IAuditRepository {
  insert(input: CreateAuditEntryInput): Promise<Result<void>>;
  findByEmpresa(empresaId: string, limit?: number): Promise<Result<AuditEntry[]>>;
}
