import { describe, expect, it, vi } from 'vitest';
import { generarCsvLoteUseCase } from '@/core/application/use-cases/mascotas/generarCsvLote.use-case';
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { PetChapaLote } from '@/core/domain/entities/pet-chapa-types';
import { URL_TIENDA_MASCOTAS } from '@/lib/pet-id/urls';
import { generarCodigoChapa } from '@/lib/pet-id/codigo';

// sdd pet-id-qr-profile, Fase 8 (R-QR.14.3) — el CSV lleva TODOS los
// códigos del lote de una vez (sin paginar, a diferencia del PDF): el
// proveedor imprime con datos variables sobre el lote completo.

const EMPRESA_ID = 'empresa-1';
const LOTE_ID = 'lote-1';

const loteEjemplo: PetChapaLote = {
  id: LOTE_ID,
  empresaId: EMPRESA_ID,
  productoId: 'producto-1',
  codigo: 'L01',
  createdAt: '2026-11-20T00:00:00.000Z',
};

function codigoValido(n: number): string {
  return generarCodigoChapa(() => Uint8Array.from([n >> 24 & 0xff, n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, (n * 7) & 0xff]));
}

function fakeRepo(overrides: Partial<IPetChapaAdminRepository> = {}): IPetChapaAdminRepository {
  return {
    createLote: vi.fn(),
    findLoteById: vi.fn().mockResolvedValue({ success: true, data: loteEjemplo }),
    findLotes: vi.fn(),
    findCodigosDeLote: vi.fn().mockResolvedValue({ success: true, data: [codigoValido(1), codigoValido(2)] }),
    insertCodigosIgnorandoDuplicados: vi.fn(),
    countPorEstado: vi.fn(),
    borrarDatos: vi.fn(),
    ...overrides,
  };
}

describe('generarCsvLoteUseCase', () => {
  it('devuelve PET_CHAPA_LOTE_NOT_FOUND si el lote no existe o es de otra empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });

    const result = await generarCsvLoteUseCase(repo, EMPRESA_ID, LOTE_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PET_CHAPA_LOTE_NOT_FOUND');
    expect(repo.findCodigosDeLote).not.toHaveBeenCalled();
  });

  it('devuelve VALIDATION_ERROR si el lote no tiene códigos', async () => {
    const repo = fakeRepo({ findCodigosDeLote: vi.fn().mockResolvedValue({ success: true, data: [] }) });

    const result = await generarCsvLoteUseCase(repo, EMPRESA_ID, LOTE_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve PET_CODIGO_INVALIDO si un código no supera esCodigoChapaValido', async () => {
    const repo = fakeRepo({ findCodigosDeLote: vi.fn().mockResolvedValue({ success: true, data: ['BASURA'] }) });

    const result = await generarCsvLoteUseCase(repo, EMPRESA_ID, LOTE_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PET_CODIGO_INVALIDO');
  });

  it('devuelve TODOS los códigos del lote de una vez, sin paginar, con la URL del perfil', async () => {
    const repo = fakeRepo();

    const result = await generarCsvLoteUseCase(repo, EMPRESA_ID, LOTE_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.codigoLote).toBe('L01');
      expect(result.data.etiquetas).toHaveLength(2);
      for (const e of result.data.etiquetas) {
        expect(e.url).toBe(`${URL_TIENDA_MASCOTAS}/m/${e.codigo}`);
      }
      expect(JSON.stringify(result.data)).not.toMatch(/telefono|email/i);
    }
  });
});
