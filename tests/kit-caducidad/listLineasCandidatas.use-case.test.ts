import { describe, expect, it, vi } from 'vitest';
import { listLineasCandidatasUseCase } from '@/core/application/use-cases/kits/listLineasCandidatas.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { ConsumibleKit, KitLote, LineaCandidata } from '@/core/domain/entities/kit-caducidad-types';

const LOTE_ID = 'lote-1';
const AGUA_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const GASA_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa7';

const loteEjemplo: KitLote = {
  id: LOTE_ID,
  empresaId: 'empresa-1',
  productoId: 'producto-1',
  codigo: 'KEC-001',
  fechaMontaje: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
};

const consumiblesEjemplo: ConsumibleKit[] = [
  { ingredienteId: AGUA_ID, nombre: 'Agua', esPerecedero: true },
  { ingredienteId: GASA_ID, nombre: 'Gasa botiquín', esPerecedero: true },
  { ingredienteId: 'ing-no-perecedero', nombre: 'Linterna', esPerecedero: false },
];

const lineasEjemplo: LineaCandidata[] = [
  {
    albaranCompraItemId: 'item-1',
    ingredienteId: AGUA_ID,
    numeroLote: 'L-1',
    fechaCaducidad: '2027-01-01',
    numeroAlbaran: 'ALB-1',
    fechaRecepcion: '2026-11-01',
  },
];

function fakeRepo(overrides: Partial<IKitCaducidadRepository> = {}): IKitCaducidadRepository {
  return {
    findProductosKit: vi.fn(),
    findConsumiblesDelKit: vi.fn().mockResolvedValue({ success: true, data: consumiblesEjemplo }),
    createLote: vi.fn(),
    findLotes: vi.fn(),
    findLoteById: vi.fn().mockResolvedValue({ success: true, data: loteEjemplo }),
    findCaducidades: vi.fn(),
    replaceCaducidades: vi.fn(),
    findLineasCandidatas: vi.fn().mockResolvedValue({ success: true, data: lineasEjemplo }),
    findPartesUsadas: vi.fn().mockResolvedValue({ success: true, data: ['botiquin-salon'] }),
    insertSeriesIgnorandoDuplicados: vi.fn(),
    findSeriesDeLote: vi.fn(),
    findRegistrados: vi.fn(),
    findContacto: vi.fn(),
    findKitPublico: vi.fn(),
    findCaducidadesEfectivas: vi.fn(),
    ...overrides,
  };
}

describe('listLineasCandidatasUseCase', () => {
  it('combina las líneas candidatas de los consumibles perecederos con las partes ya usadas', async () => {
    const repo = fakeRepo();
    const result = await listLineasCandidatasUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result).toEqual({
      success: true,
      data: { lineas: lineasEjemplo, partesUsadas: ['botiquin-salon'] },
    });
    expect(repo.findLineasCandidatas).toHaveBeenCalledWith(
      'empresa-1',
      [AGUA_ID, GASA_ID],
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(repo.findPartesUsadas).toHaveBeenCalledWith('empresa-1');
  });

  it('no llama a findLineasCandidatas si el kit no tiene consumibles perecederos', async () => {
    const repo = fakeRepo({
      findConsumiblesDelKit: vi.fn().mockResolvedValue({
        success: true,
        data: [{ ingredienteId: 'ing-no-perecedero', nombre: 'Linterna', esPerecedero: false }],
      }),
    });

    const result = await listLineasCandidatasUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result).toEqual({ success: true, data: { lineas: [], partesUsadas: ['botiquin-salon'] } });
    expect(repo.findLineasCandidatas).not.toHaveBeenCalled();
    expect(repo.findPartesUsadas).toHaveBeenCalledWith('empresa-1');
  });

  it('propaga KIT_LOTE_NOT_FOUND cuando el lote no existe para la empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const result = await listLineasCandidatasUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_LOTE_NOT_FOUND');
    expect(repo.findConsumiblesDelKit).not.toHaveBeenCalled();
    expect(repo.findLineasCandidatas).not.toHaveBeenCalled();
    expect(repo.findPartesUsadas).not.toHaveBeenCalled();
  });
});
