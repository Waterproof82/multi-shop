import { describe, expect, it, vi } from 'vitest';
import { replaceKitLoteCaducidadesUseCase } from '@/core/application/use-cases/kits/replaceKitLoteCaducidades.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { ConsumibleKit, KitLote } from '@/core/domain/entities/kit-caducidad-types';

const LOTE_ID = 'lote-1';
const AGUA_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const GASA_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa7';
const ALBARAN_ITEM_ID = '5fa85f64-5717-4562-b3fc-2c963f66afa8';

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

function fakeRepo(overrides: Partial<IKitCaducidadRepository> = {}): IKitCaducidadRepository {
  return {
    findProductosKit: vi.fn(),
    findConsumiblesDelKit: vi.fn().mockResolvedValue({ success: true, data: consumiblesEjemplo }),
    createLote: vi.fn(),
    findLotes: vi.fn(),
    findLoteById: vi.fn().mockResolvedValue({ success: true, data: loteEjemplo }),
    findCaducidades: vi.fn(),
    replaceCaducidades: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    findLineasCandidatas: vi.fn(),
    findPartesUsadas: vi.fn(),
    insertSeriesIgnorandoDuplicados: vi.fn(),
    findSeriesDeLote: vi.fn(),
    ...overrides,
  };
}

const payloadValido = {
  items: [
    { ingredienteId: AGUA_ID, albaranCompraItemId: ALBARAN_ITEM_ID },
    { ingredienteId: GASA_ID, parte: 'botiquin-salon', caducaEl: '2027-01-01' },
  ],
};

describe('replaceKitLoteCaducidadesUseCase', () => {
  it('reemplaza las caducidades cuando el payload cubre todos los consumibles perecederos', async () => {
    const repo = fakeRepo();
    const result = await replaceKitLoteCaducidadesUseCase(repo, 'empresa-1', LOTE_ID, payloadValido);

    expect(result.success).toBe(true);
    expect(repo.replaceCaducidades).toHaveBeenCalledWith(
      'empresa-1',
      LOTE_ID,
      expect.arrayContaining([
        expect.objectContaining({ ingredienteId: AGUA_ID, albaranCompraItemId: ALBARAN_ITEM_ID }),
        expect.objectContaining({ ingredienteId: GASA_ID, parte: 'botiquin-salon', caducaEl: '2027-01-01' }),
      ]),
    );
  });

  it('rechaza un ítem con ambas fuentes a la vez (XOR incumplido)', async () => {
    const repo = fakeRepo();
    const result = await replaceKitLoteCaducidadesUseCase(repo, 'empresa-1', LOTE_ID, {
      items: [
        { ingredienteId: AGUA_ID, albaranCompraItemId: ALBARAN_ITEM_ID, parte: 'x', caducaEl: '2027-01-01' },
        { ingredienteId: GASA_ID, parte: 'botiquin-salon', caducaEl: '2027-01-01' },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.replaceCaducidades).not.toHaveBeenCalled();
  });

  it('rechaza un ítem sin ninguna fuente (XOR incumplido)', async () => {
    const repo = fakeRepo();
    const result = await replaceKitLoteCaducidadesUseCase(repo, 'empresa-1', LOTE_ID, {
      items: [
        { ingredienteId: AGUA_ID },
        { ingredienteId: GASA_ID, parte: 'botiquin-salon', caducaEl: '2027-01-01' },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.replaceCaducidades).not.toHaveBeenCalled();
  });

  it('rechaza una combinación (ingredienteId, parte) duplicada', async () => {
    const repo = fakeRepo();
    const result = await replaceKitLoteCaducidadesUseCase(repo, 'empresa-1', LOTE_ID, {
      items: [
        { ingredienteId: GASA_ID, parte: 'botiquin-salon', caducaEl: '2027-01-01' },
        { ingredienteId: GASA_ID, parte: 'botiquin-salon', caducaEl: '2027-06-01' },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.replaceCaducidades).not.toHaveBeenCalled();
  });

  it('rechaza cuando falta un consumible perecedero sin fila, indicando su nombre', async () => {
    const repo = fakeRepo();
    const result = await replaceKitLoteCaducidadesUseCase(repo, 'empresa-1', LOTE_ID, {
      items: [{ ingredienteId: AGUA_ID, albaranCompraItemId: ALBARAN_ITEM_ID }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Gasa botiquín');
    }
    expect(repo.replaceCaducidades).not.toHaveBeenCalled();
  });

  it('propaga KIT_LOTE_NOT_FOUND cuando el lote no existe para la empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const result = await replaceKitLoteCaducidadesUseCase(repo, 'empresa-1', LOTE_ID, payloadValido);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_LOTE_NOT_FOUND');
    expect(repo.replaceCaducidades).not.toHaveBeenCalled();
  });
});
