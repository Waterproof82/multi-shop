import { describe, expect, it, vi } from 'vitest';
import { listarLotesChapaUseCase } from '@/core/application/use-cases/mascotas/listarLotesChapa.use-case';
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';

// sdd pet-id-qr-profile, Fase 7 (admin UI) — calco de `listKitLotesUseCase`:
// valida la paginación en la frontera y delega el resto en el repositorio.

function fakeRepo(overrides: Partial<IPetChapaAdminRepository> = {}): IPetChapaAdminRepository {
  return {
    createLote: vi.fn(),
    findLoteById: vi.fn(),
    findLotes: vi.fn().mockResolvedValue({ success: true, data: { items: [], total: 0, page: 1, pageSize: 50 } }),
    findCodigosDeLote: vi.fn(),
    insertCodigosIgnorandoDuplicados: vi.fn(),
    countPorEstado: vi.fn(),
    borrarDatos: vi.fn(),
    ...overrides,
  };
}

describe('listarLotesChapaUseCase', () => {
  it('aplica los valores por defecto de paginación (page=1, pageSize=50)', async () => {
    const repo = fakeRepo();
    await listarLotesChapaUseCase(repo, 'empresa-1', {});

    expect(repo.findLotes).toHaveBeenCalledWith('empresa-1', { page: 1, pageSize: 50 });
  });

  it('rechaza una página fuera de rango sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await listarLotesChapaUseCase(repo, 'empresa-1', { page: 0 });

    expect(result.success).toBe(false);
    expect(repo.findLotes).not.toHaveBeenCalled();
  });

  it('devuelve la página del repositorio', async () => {
    const pagina = { items: [], total: 3, page: 2, pageSize: 10 };
    const repo = fakeRepo({ findLotes: vi.fn().mockResolvedValue({ success: true, data: pagina }) });

    const result = await listarLotesChapaUseCase(repo, 'empresa-1', { page: 2, pageSize: 10 });

    expect(result).toEqual({ success: true, data: pagina });
  });
});
