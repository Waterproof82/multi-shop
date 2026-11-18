import { describe, expect, it, vi } from 'vitest';
import { createKitLoteUseCase } from '@/core/application/use-cases/kits/createKitLote.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { KitLote } from '@/core/domain/entities/kit-caducidad-types';

const PRODUCTO_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const loteEjemplo: KitLote = {
  id: 'lote-1',
  empresaId: 'empresa-1',
  productoId: PRODUCTO_ID,
  codigo: 'KEC-001',
  fechaMontaje: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
};

function fakeRepo(overrides: Partial<IKitCaducidadRepository> = {}): IKitCaducidadRepository {
  return {
    findProductosKit: vi.fn().mockResolvedValue({ success: true, data: [] }),
    findConsumiblesDelKit: vi.fn().mockResolvedValue({
      success: true,
      data: [{ ingredienteId: 'ing-1', nombre: 'Agua', esPerecedero: true }],
    }),
    createLote: vi.fn().mockResolvedValue({ success: true, data: loteEjemplo }),
    findLotes: vi.fn(),
    findLoteById: vi.fn(),
    findCaducidades: vi.fn(),
    replaceCaducidades: vi.fn(),
    findLineasCandidatas: vi.fn(),
    findPartesUsadas: vi.fn(),
    insertSeriesIgnorandoDuplicados: vi.fn(),
    findSeriesDeLote: vi.fn(),
    ...overrides,
  };
}

describe('createKitLoteUseCase', () => {
  it('crea el lote cuando el producto es un kit de la propia empresa', async () => {
    const repo = fakeRepo();
    const result = await createKitLoteUseCase(repo, 'empresa-1', {
      productoId: PRODUCTO_ID,
      codigo: 'KEC-001',
      fechaMontaje: '2026-11-01',
    });

    expect(result).toEqual({ success: true, data: loteEjemplo });
    expect(repo.createLote).toHaveBeenCalledWith('empresa-1', {
      productoId: PRODUCTO_ID,
      codigo: 'KEC-001',
      fechaMontaje: '2026-11-01',
    });
  });

  it('rechaza un producto sin consumibles perecederos (no es un kit)', async () => {
    const repo = fakeRepo({
      findConsumiblesDelKit: vi.fn().mockResolvedValue({
        success: true,
        data: [{ ingredienteId: 'ing-1', nombre: 'Vaso', esPerecedero: false }],
      }),
    });

    const result = await createKitLoteUseCase(repo, 'empresa-1', {
      productoId: PRODUCTO_ID,
      codigo: 'KEC-001',
      fechaMontaje: '2026-11-01',
    });

    expect(result.success).toBe(false);
    expect(repo.createLote).not.toHaveBeenCalled();
  });

  it('rechaza un producto de otra empresa sin revelar si existe (consumibles vacíos)', async () => {
    const repo = fakeRepo({
      findConsumiblesDelKit: vi.fn().mockResolvedValue({ success: true, data: [] }),
    });

    const result = await createKitLoteUseCase(repo, 'empresa-1', {
      productoId: PRODUCTO_ID,
      codigo: 'KEC-001',
      fechaMontaje: '2026-11-01',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(repo.createLote).not.toHaveBeenCalled();
  });

  it('propaga el 23505 → CONFLICT del repositorio sin traducirlo de nuevo', async () => {
    const repo = fakeRepo({
      createLote: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'CONFLICT', message: 'Ya existe un lote con ese código', module: 'repository' },
      }),
    });

    const result = await createKitLoteUseCase(repo, 'empresa-1', {
      productoId: PRODUCTO_ID,
      codigo: 'KEC-001',
      fechaMontaje: '2026-11-01',
    });

    expect(result).toEqual({
      success: false,
      error: { code: 'CONFLICT', message: 'Ya existe un lote con ese código', module: 'repository' },
    });
  });

  it('rechaza un payload inválido sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await createKitLoteUseCase(repo, 'empresa-1', { productoId: 'no-es-uuid' });

    expect(result.success).toBe(false);
    expect(repo.findConsumiblesDelKit).not.toHaveBeenCalled();
  });
});
