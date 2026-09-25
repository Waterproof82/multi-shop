import type {
  ILandingSeccionRepository,
  LandingSeccionActiva,
  UpsertLandingSeccionData,
} from '@/core/domain/repositories/ILandingSeccionRepository';
import type { LandingSeccion, LandingSeccionTipo, Result } from '@/core/domain/entities/types';

export type ActivasPorEmpresa = Record<string, LandingSeccionTipo[]>;

export function agruparActivosPorEmpresa(filas: LandingSeccionActiva[]): ActivasPorEmpresa {
  const agrupado: ActivasPorEmpresa = {};
  for (const { empresaId, tipo } of filas) {
    (agrupado[empresaId] ??= []).push(tipo);
  }
  return agrupado;
}

export class LandingSeccionUseCase {
  constructor(private readonly repo: ILandingSeccionRepository) {}

  getAll(empresaId: string): Promise<Result<LandingSeccion[]>> {
    return this.repo.findAllByTenant(empresaId);
  }

  upsert(empresaId: string, tipo: LandingSeccionTipo, data: UpsertLandingSeccionData): Promise<Result<LandingSeccion>> {
    return this.repo.upsertByTipo(empresaId, tipo, data);
  }

  async getActivasPorEmpresa(): Promise<Result<ActivasPorEmpresa>> {
    const result = await this.repo.findAllActivas();
    if (!result.success) return result;
    return { success: true, data: agruparActivosPorEmpresa(result.data) };
  }

  setActivo(empresaId: string, tipo: LandingSeccionTipo, activo: boolean): Promise<Result<LandingSeccion>> {
    return this.repo.setActivo(empresaId, tipo, activo);
  }
}
