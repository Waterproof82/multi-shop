import { describe, expect, it, vi } from 'vitest';
import { getKitLoteEditorUseCase } from '@/core/application/use-cases/kits/getKitLoteEditor.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { ConsumibleKit, KitLote, KitLoteCaducidad } from '@/core/domain/entities/kit-caducidad-types';

const LOTE_ID = 'lote-1';

const loteEjemplo: KitLote = {
  id: LOTE_ID,
  empresaId: 'empresa-1',
  productoId: 'producto-1',
  codigo: 'KEC-001',
  fechaMontaje: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
};

const consumiblesEjemplo: ConsumibleKit[] = [
  { ingredienteId: 'ing-agua', nombre: 'Agua', esPerecedero: true },
];

const caducidadesEjemplo: KitLoteCaducidad[] = [
  { ingredienteId: 'ing-agua', parte: '', albaranCompraItemId: 'albaran-item-1', caducaEl: null },
];

function fakeRepo(overrides: Partial<IKitCaducidadRepository> = {}): IKitCaducidadRepository {
  return {
    findProductosKit: vi.fn(),
    findConsumiblesDelKit: vi.fn().mockResolvedValue({ success: true, data: consumiblesEjemplo }),
    createLote: vi.fn(),
    findLotes: vi.fn(),
    findLoteById: vi.fn().mockResolvedValue({ success: true, data: loteEjemplo }),
    findCaducidades: vi.fn().mockResolvedValue({ success: true, data: caducidadesEjemplo }),
    replaceCaducidades: vi.fn(),
    findLineasCandidatas: vi.fn(),
    findPartesUsadas: vi.fn(),
    insertSeriesIgnorandoDuplicados: vi.fn(),
    findSeriesDeLote: vi.fn(),
    findRegistrados: vi.fn(),
    findContacto: vi.fn(),
    findKitPublico: vi.fn(),
    findCaducidadesEfectivas: vi.fn(),
    ...overrides,
  };
}

describe('getKitLoteEditorUseCase', () => {
  it('combina el lote, sus consumibles y sus caducidades', async () => {
    const repo = fakeRepo();
    const result = await getKitLoteEditorUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result).toEqual({
      success: true,
      data: { lote: loteEjemplo, consumibles: consumiblesEjemplo, caducidades: caducidadesEjemplo },
    });
    expect(repo.findConsumiblesDelKit).toHaveBeenCalledWith('empresa-1', loteEjemplo.productoId);
    expect(repo.findCaducidades).toHaveBeenCalledWith('empresa-1', LOTE_ID);
  });

  it('propaga KIT_LOTE_NOT_FOUND cuando el lote no existe para la empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const result = await getKitLoteEditorUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_LOTE_NOT_FOUND');
    expect(repo.findConsumiblesDelKit).not.toHaveBeenCalled();
    expect(repo.findCaducidades).not.toHaveBeenCalled();
  });
});
