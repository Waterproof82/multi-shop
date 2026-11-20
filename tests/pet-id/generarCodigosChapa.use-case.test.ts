import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generarCodigosChapaUseCase } from '@/core/application/use-cases/mascotas/generarCodigosChapa.use-case';
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { PetChapaLote } from '@/core/domain/entities/pet-chapa-types';
import { esCodigoChapaValido } from '@/lib/pet-id/codigo';

// sdd pet-id-qr-profile, Fase 5 — calco exacto de
// `generarSeriesLote.use-case.test.ts` (kit-expiry-m4c, R-M4.4), con
// `PET_CHAPA_LOTE_NOT_FOUND` en vez de `KIT_LOTE_NOT_FOUND`.

const LOTE_ID = 'lote-1';

const loteEjemplo: PetChapaLote = {
  id: LOTE_ID,
  empresaId: 'empresa-1',
  productoId: 'producto-1',
  codigo: 'L01',
  createdAt: '2026-11-20T00:00:00Z',
};

function fakeRepo(overrides: Partial<IPetChapaAdminRepository> = {}): IPetChapaAdminRepository {
  return {
    createLote: vi.fn(),
    findLoteById: vi.fn().mockResolvedValue({ success: true, data: loteEjemplo }),
    findLotes: vi.fn(),
    findCodigosDeLote: vi.fn(),
    insertCodigosIgnorandoDuplicados: vi.fn(),
    borrarDatos: vi.fn(),
    countPorEstado: vi.fn(),
    ...overrides,
  };
}

let contador = 0;
function generadorSecuencial(): string {
  contador += 1;
  return `CODIGO-${contador}`;
}

describe('generarCodigosChapaUseCase', () => {
  beforeEach(() => {
    contador = 0;
  });

  it('inserta N códigos válidos y únicos cuando no hay colisión', async () => {
    const insert = vi.fn().mockImplementation(async (_e: string, _l: string, codigos: string[]) => ({ success: true, data: codigos }));
    const repo = fakeRepo({ insertCodigosIgnorandoDuplicados: insert });

    const result = await generarCodigosChapaUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 50 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(50);
      expect(result.data.every(esCodigoChapaValido)).toBe(true);
      expect(new Set(result.data).size).toBe(50);
    }
    expect(insert).toHaveBeenCalledWith('empresa-1', LOTE_ID, expect.any(Array));
  });

  it('rechaza N=0 sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await generarCodigosChapaUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 0 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.insertCodigosIgnorandoDuplicados).not.toHaveBeenCalled();
  });

  it('rechaza N=501 sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await generarCodigosChapaUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 501 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.insertCodigosIgnorandoDuplicados).not.toHaveBeenCalled();
  });

  it('reintenta con códigos nuevos cuando una colisión descarta una fila', async () => {
    const insert = vi.fn()
      .mockResolvedValueOnce({ success: true, data: ['CODIGO-1'] }) // se pidieron 2, el repo solo confirma 1 (colisión)
      .mockResolvedValueOnce({ success: true, data: ['CODIGO-3'] });
    const repo = fakeRepo({ insertCodigosIgnorandoDuplicados: insert });

    const result = await generarCodigosChapaUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 2 }, generadorSecuencial);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(['CODIGO-1', 'CODIGO-3']);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][2]).toEqual(['CODIGO-3']); // el segundo intento solo pide lo que faltaba
  });

  it('falla con CONFLICT y cuántos se generaron si se agotan los 5 reintentos', async () => {
    const insert = vi.fn().mockResolvedValue({ success: true, data: [] }); // nunca confirma ninguno
    const repo = fakeRepo({ insertCodigosIgnorandoDuplicados: insert });

    const result = await generarCodigosChapaUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 3 }, generadorSecuencial);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.message).toContain('0 de 3');
    }
    expect(insert).toHaveBeenCalledTimes(5);
  });

  it('propaga PET_CHAPA_LOTE_NOT_FOUND cuando el lote no existe para la empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const result = await generarCodigosChapaUseCase(repo, 'empresa-1', LOTE_ID, { cantidad: 10 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PET_CHAPA_LOTE_NOT_FOUND');
    expect(repo.insertCodigosIgnorandoDuplicados).not.toHaveBeenCalled();
  });
});
