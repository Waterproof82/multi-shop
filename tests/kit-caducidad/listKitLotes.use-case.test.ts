import { describe, expect, it, vi } from 'vitest';
import { listKitLotesUseCase } from '@/core/application/use-cases/kits/listKitLotes.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';

function fakeRepo(overrides: Partial<IKitCaducidadRepository> = {}): IKitCaducidadRepository {
  return {
    findProductosKit: vi.fn(),
    findConsumiblesDelKit: vi.fn(),
    createLote: vi.fn(),
    findLotes: vi.fn().mockResolvedValue({ success: true, data: { items: [], total: 0, page: 1, pageSize: 50 } }),
    findLoteById: vi.fn(),
    findCaducidades: vi.fn(),
    replaceCaducidades: vi.fn(),
    findLineasCandidatas: vi.fn(),
    findPartesUsadas: vi.fn(),
    ...overrides,
  };
}

describe('listKitLotesUseCase', () => {
  it('aplica los valores por defecto de paginación (page=1, pageSize=50)', async () => {
    const repo = fakeRepo();
    await listKitLotesUseCase(repo, 'empresa-1', {});

    expect(repo.findLotes).toHaveBeenCalledWith('empresa-1', { page: 1, pageSize: 50 });
  });

  it('rechaza una página fuera de rango sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await listKitLotesUseCase(repo, 'empresa-1', { page: 0 });

    expect(result.success).toBe(false);
    expect(repo.findLotes).not.toHaveBeenCalled();
  });
});
