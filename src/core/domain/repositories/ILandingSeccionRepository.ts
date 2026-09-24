import type { Result, LandingSeccion, LandingSeccionTipo } from '@/core/domain/entities/types';

export interface UpsertLandingSeccionData {
  activo: boolean;
  orden: number;
  contenido: Record<string, unknown>;
}

export interface ILandingSeccionRepository {
  findAllByTenant(empresaId: string): Promise<Result<LandingSeccion[]>>;
  upsertByTipo(empresaId: string, tipo: LandingSeccionTipo, data: UpsertLandingSeccionData): Promise<Result<LandingSeccion>>;
}
