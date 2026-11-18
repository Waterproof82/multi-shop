import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generarSeriesLoteUseCase } from '@/core/application/use-cases/kits/generarSeriesLote.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { KitLote } from '@/core/domain/entities/kit-caducidad-types';
import { generarSerie, esSerieValida } from '@/lib/kit-caducidad/serie';

// sdd kit-expiry-reminders M4c (docs/sdd/kit-expiry-reminders/m4/), R-M4.4,
// DD10 de design.md: N acotado 1-500, `generarSerie()` + reintento ante
// colisión (hasta 5 intentos), `pedido_id` NULL (lo pone el repositorio).

const LOTE_ID = 'lote-1';

const loteEjemplo: KitLote = {
  id: LOTE_ID,
  empresaId: 'empresa-1',
  productoId: 'producto-1',
  codigo: 'KEC-001',
  fechaMontaje: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
};

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
    findSeriesDeLote: vi.fn(),
    findRegistrados: vi.fn(),
    findContacto: vi.fn(),
    ...overrides,
  };
}

let contador = 0;
function generadorSecuencial(): string {
  contador += 1;
  return `SERIE-${contador}`;
}

describe('generarSeriesLoteUseCase', () => {
  beforeEach(() => {
    contador = 0;
  });

  it('inserta N series válidas y únicas con pedidoId NULL (dejado al repositorio) cuando no hay colisión', async () => {
    const insert = vi.fn().mockImplementation(async (_e: string, _l: string, series: string[]) => ({ success: true, data: series }));
    const repo = fakeRepo({ insertSeriesIgnorandoDuplicados: insert });

    const result = await generarSeriesLoteUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 50 }, () => generarSerie());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(50);
      expect(result.data.every(esSerieValida)).toBe(true);
      expect(new Set(result.data).size).toBe(50);
    }
    expect(insert).toHaveBeenCalledWith('empresa-1', LOTE_ID, expect.any(Array));
  });

  it('rechaza N=0 sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await generarSeriesLoteUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 0 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.insertSeriesIgnorandoDuplicados).not.toHaveBeenCalled();
  });

  it('rechaza N=501 sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await generarSeriesLoteUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 501 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.insertSeriesIgnorandoDuplicados).not.toHaveBeenCalled();
  });

  it('reintenta con series nuevas cuando una colisión descarta una fila (R-M4.4.3)', async () => {
    const insert = vi.fn()
      .mockResolvedValueOnce({ success: true, data: ['SERIE-1'] }) // se pidieron 2, el repo solo confirma 1 (colisión)
      .mockResolvedValueOnce({ success: true, data: ['SERIE-3'] });
    const repo = fakeRepo({ insertSeriesIgnorandoDuplicados: insert });

    const result = await generarSeriesLoteUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 2 }, generadorSecuencial);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(['SERIE-1', 'SERIE-3']);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][2]).toEqual(['SERIE-3']); // el segundo intento solo pide lo que faltaba
  });

  it('falla con CONFLICT y cuántas se generaron si se agotan los 5 reintentos', async () => {
    const insert = vi.fn().mockResolvedValue({ success: true, data: [] }); // nunca confirma ninguna
    const repo = fakeRepo({ insertSeriesIgnorandoDuplicados: insert });

    const result = await generarSeriesLoteUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 3 }, generadorSecuencial);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.message).toContain('0 de 3');
    }
    expect(insert).toHaveBeenCalledTimes(5);
  });

  it('propaga KIT_LOTE_NOT_FOUND cuando el lote no existe para la empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const result = await generarSeriesLoteUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 10 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_LOTE_NOT_FOUND');
    expect(repo.insertSeriesIgnorandoDuplicados).not.toHaveBeenCalled();
  });
});
