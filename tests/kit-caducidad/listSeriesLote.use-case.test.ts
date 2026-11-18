import { describe, expect, it, vi } from 'vitest';
import { listSeriesLoteUseCase } from '@/core/application/use-cases/kits/listSeriesLote.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { KitLote, KitSerie } from '@/core/domain/entities/kit-caducidad-types';

// sdd kit-expiry-reminders M4c, R-M4.4.5/R-M4.4.6: listar/exportar las
// series de un lote exige que el lote sea de la propia empresa.

const LOTE_ID = 'lote-1';

const loteEjemplo: KitLote = {
  id: LOTE_ID,
  empresaId: 'empresa-1',
  productoId: 'producto-1',
  codigo: 'KEC-001',
  fechaMontaje: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
};

const seriesEjemplo: KitSerie[] = [
  { serie: 'KEC-0000-0001-A', loteId: LOTE_ID, empresaId: 'empresa-1', pedidoId: null, registradoAt: null, createdAt: '2026-11-01T00:00:00.000Z' },
  { serie: 'KEC-0000-0002-B', loteId: LOTE_ID, empresaId: 'empresa-1', pedidoId: null, registradoAt: null, createdAt: '2026-11-01T00:00:00.000Z' },
];

function fakeRepo(overrides: Partial<IKitCaducidadRepository> = {}): IKitCaducidadRepository {
  return {
    findProductosKit: vi.fn(),
    findConsumiblesDelKit: vi.fn(),
    createLote: vi.fn(),
    findLotes: vi.fn(),
    findLoteById: vi.fn().mockResolvedValue({ success: true, data: loteEjemplo }),
    findCaducidades: vi.fn(),
    replaceCaducidades: vi.fn(),
    findLineasCandidatas: vi.fn(),
    findPartesUsadas: vi.fn(),
    insertSeriesIgnorandoDuplicados: vi.fn(),
    findSeriesDeLote: vi.fn().mockResolvedValue({ success: true, data: seriesEjemplo }),
    findRegistrados: vi.fn(),
    findContacto: vi.fn(),
    findKitPublico: vi.fn(),
    findCaducidadesEfectivas: vi.fn(),
    ...overrides,
  };
}

describe('listSeriesLoteUseCase', () => {
  it('devuelve las series del lote cuando el lote es de la empresa', async () => {
    const repo = fakeRepo();
    const result = await listSeriesLoteUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(seriesEjemplo);
    expect(repo.findSeriesDeLote).toHaveBeenCalledWith('empresa-1', LOTE_ID);
  });

  it('propaga KIT_LOTE_NOT_FOUND sin listar series cuando el lote no existe para la empresa (R-M4.4.6)', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const result = await listSeriesLoteUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_LOTE_NOT_FOUND');
    expect(repo.findSeriesDeLote).not.toHaveBeenCalled();
  });
});
