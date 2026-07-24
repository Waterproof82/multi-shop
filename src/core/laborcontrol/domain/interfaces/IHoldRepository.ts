import type { Result } from '@/core/domain/entities/types';
import type { LegalHold } from '../types';

export interface CreateHoldInput {
  empresaId: string;
  empleadoId?: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string;
  motivo: string;
  actorId: string;
}

export interface IHoldRepository {
  create(input: CreateHoldInput): Promise<Result<LegalHold>>;
  findByEmpresa(empresaId: string): Promise<Result<LegalHold[]>>;
  lift(id: string, empresaId: string, actorId: string): Promise<Result<void>>;
  hasActiveHold(empresaId: string, empleadoId?: string): Promise<Result<boolean>>;
}
