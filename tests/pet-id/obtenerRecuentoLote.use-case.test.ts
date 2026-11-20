import { describe, expect, it, vi } from 'vitest';
import { obtenerRecuentoLoteUseCase } from '@/core/application/use-cases/mascotas/obtenerRecuentoLote.use-case';
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { PetChapaLote } from '@/core/domain/entities/pet-chapa-types';

// sdd pet-id-qr-profile, Fase 5 (R-QR.1.2) — calco de
// `listSeriesLote.use-case.test.ts`: el lote debe ser de la propia empresa
// antes de contar, y el recuento nunca lleva PII (lo garantiza el repo).

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

describe('obtenerRecuentoLoteUseCase', () => {
  it('con un lote de la empresa, devuelve el recuento del repositorio', async () => {
    const countPorEstado = vi.fn().mockResolvedValue({ success: true, data: { libre: 2, pendiente: 1, activa: 5 } });
    const repo = fakeRepo({ countPorEstado });

    const result = await obtenerRecuentoLoteUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result).toEqual({ success: true, data: { libre: 2, pendiente: 1, activa: 5 } });
    expect(countPorEstado).toHaveBeenCalledWith('empresa-1', LOTE_ID);
  });

  it('propaga PET_CHAPA_LOTE_NOT_FOUND sin llamar a countPorEstado cuando el lote no es de la empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });

    const result = await obtenerRecuentoLoteUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PET_CHAPA_LOTE_NOT_FOUND');
    expect(repo.countPorEstado).not.toHaveBeenCalled();
  });

  it('propaga el error de findLoteById', async () => {
    const repo = fakeRepo({
      findLoteById: vi.fn().mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'caído', module: 'repository' } }),
    });

    const result = await obtenerRecuentoLoteUseCase(repo, 'empresa-1', LOTE_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DB_ERROR');
  });
});
