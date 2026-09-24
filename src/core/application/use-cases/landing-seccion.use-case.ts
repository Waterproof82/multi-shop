import type {
  ILandingSeccionRepository,
  UpsertLandingSeccionData,
} from '@/core/domain/repositories/ILandingSeccionRepository';
import type { LandingSeccion, LandingSeccionTipo, Result } from '@/core/domain/entities/types';

export class LandingSeccionUseCase {
  constructor(private readonly repo: ILandingSeccionRepository) {}

  getAll(empresaId: string): Promise<Result<LandingSeccion[]>> {
    return this.repo.findAllByTenant(empresaId);
  }

  upsert(empresaId: string, tipo: LandingSeccionTipo, data: UpsertLandingSeccionData): Promise<Result<LandingSeccion>> {
    return this.repo.upsertByTipo(empresaId, tipo, data);
  }
}
