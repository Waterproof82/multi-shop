import { describe, it, expect, vi } from 'vitest';
import {
  LandingSeccionUseCase,
  agruparActivosPorEmpresa,
} from '@/core/application/use-cases/landing-seccion.use-case';
import { setActivoLandingSeccionSchema } from '@/core/application/dtos/landing-seccion.dto';
import type { ILandingSeccionRepository } from '@/core/domain/repositories/ILandingSeccionRepository';
import type { LandingSeccion } from '@/core/domain/entities/types';

function repoFake(overrides: Partial<ILandingSeccionRepository> = {}): ILandingSeccionRepository {
  return {
    findAllByTenant: vi.fn(),
    upsertByTipo: vi.fn(),
    findAllActivas: vi.fn(),
    setActivo: vi.fn(),
    ...overrides,
  };
}

describe('agruparActivosPorEmpresa', () => {
  it('agrupa los tipos activos por empresa', () => {
    const agrupado = agruparActivosPorEmpresa([
      { empresaId: 'e1', tipo: 'hero' },
      { empresaId: 'e1', tipo: 'galeria' },
      { empresaId: 'e2', tipo: 'nosotros' },
    ]);
    expect(agrupado).toEqual({ e1: ['hero', 'galeria'], e2: ['nosotros'] });
  });

  it('devuelve un objeto vacío sin filas', () => {
    expect(agruparActivosPorEmpresa([])).toEqual({});
  });
});

describe('LandingSeccionUseCase.getActivasPorEmpresa', () => {
  it('agrupa lo que devuelve el repositorio', async () => {
    const repo = repoFake({
      findAllActivas: vi.fn().mockResolvedValue({
        success: true,
        data: [
          { empresaId: 'e1', tipo: 'hero' },
          { empresaId: 'e1', tipo: 'visitanos' },
        ],
      }),
    });
    const result = await new LandingSeccionUseCase(repo).getActivasPorEmpresa();
    expect(result).toEqual({ success: true, data: { e1: ['hero', 'visitanos'] } });
  });

  it('propaga el error del repositorio', async () => {
    const error = { code: 'DB_ERROR', message: 'fallo', module: 'repository', method: 'findAllActivas' };
    const repo = repoFake({ findAllActivas: vi.fn().mockResolvedValue({ success: false, error }) });
    const result = await new LandingSeccionUseCase(repo).getActivasPorEmpresa();
    expect(result).toEqual({ success: false, error });
  });
});

describe('LandingSeccionUseCase.setActivo', () => {
  it('delega en el repositorio solo el flag activo, sin tocar orden ni contenido', async () => {
    const seccion: LandingSeccion = {
      id: 's1', empresaId: 'e1', tipo: 'nosotros', activo: true, orden: 3, contenido: { titulo: { es: 'Hola' } },
    };
    const setActivo = vi.fn().mockResolvedValue({ success: true, data: seccion });
    const repo = repoFake({ setActivo });
    const result = await new LandingSeccionUseCase(repo).setActivo('e1', 'nosotros', true);
    expect(setActivo).toHaveBeenCalledWith('e1', 'nosotros', true);
    expect(result).toEqual({ success: true, data: seccion });
  });
});

describe('setActivoLandingSeccionSchema', () => {
  it('acepta { activo: boolean }', () => {
    expect(setActivoLandingSeccionSchema.safeParse({ activo: false }).success).toBe(true);
  });

  it('rechaza activo faltante o no booleano', () => {
    expect(setActivoLandingSeccionSchema.safeParse({}).success).toBe(false);
    expect(setActivoLandingSeccionSchema.safeParse({ activo: 'true' }).success).toBe(false);
  });

  it('rechaza campos extra para que un switch nunca pueda pisar contenido u orden', () => {
    expect(setActivoLandingSeccionSchema.safeParse({ activo: true, contenido: {} }).success).toBe(false);
  });
});
