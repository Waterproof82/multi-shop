import type { Result, LandingSeccion, LandingSeccionTipo } from '@/core/domain/entities/types';

export interface UpsertLandingSeccionData {
  activo: boolean;
  orden: number;
  contenido: Record<string, unknown>;
}

export interface LandingSeccionActiva {
  empresaId: string;
  tipo: LandingSeccionTipo;
}

export interface ILandingSeccionRepository {
  findAllByTenant(empresaId: string): Promise<Result<LandingSeccion[]>>;
  upsertByTipo(empresaId: string, tipo: LandingSeccionTipo, data: UpsertLandingSeccionData): Promise<Result<LandingSeccion>>;
  /** Cross-tenant: solo para el panel de superadmin. */
  findAllActivas(): Promise<Result<LandingSeccionActiva[]>>;
  /** Cambia solo `activo`; si la fila no existe la crea con los defaults de la tabla. */
  setActivo(empresaId: string, tipo: LandingSeccionTipo, activo: boolean): Promise<Result<LandingSeccion>>;
}
