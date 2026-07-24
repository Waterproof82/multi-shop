import type { Result } from '@/core/domain/entities/types';
import type { ReviewQueueItem, ReviewTipo, ReviewEstado } from '../types';

export interface CreateReviewItemInput {
  empresaId: string;
  centroId: string;
  empleadoId: string;
  recordId?: string;
  tipoRevision: ReviewTipo;
  detalle?: Record<string, unknown>;
}

export interface IReviewQueueRepository {
  create(input: CreateReviewItemInput): Promise<Result<ReviewQueueItem>>;
  findByEmpleado(empresaId: string, empleadoId: string): Promise<Result<ReviewQueueItem[]>>;
  findPendientesByEmpresa(empresaId: string): Promise<Result<ReviewQueueItem[]>>;
  updateEstado(id: string, estado: ReviewEstado, resolvedBy?: string): Promise<Result<void>>;
}
