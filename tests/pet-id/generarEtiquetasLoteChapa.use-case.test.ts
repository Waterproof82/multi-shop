import { describe, expect, it, vi } from 'vitest';
import { generarEtiquetasLoteUseCase } from '@/core/application/use-cases/mascotas/generarEtiquetasLote.use-case';
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { PetChapaLote } from '@/core/domain/entities/pet-chapa-types';
import { POR_PDF } from '@/lib/pet-id/chapa-layout';
import { URL_TIENDA_MASCOTAS } from '@/lib/pet-id/urls';
import { generarCodigoChapa } from '@/lib/pet-id/codigo';

// sdd pet-id-qr-profile, Fase 8 (R-QR.14.1/R-QR.14.4) — calco de
// `generarEtiquetasLote.use-case.test.ts` de kit-caducidad (M5): el caso de
// uso devuelve DATOS para la etiqueta (sin React ni qrcode), con un
// repositorio falso.

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
    findCodigosDeLote: vi.fn().mockResolvedValue({ success: true, data: [codigoValido(1)] }),
    insertCodigosIgnorandoDuplicados: vi.fn(),
    countPorEstado: vi.fn(),
    borrarDatos: vi.fn(),
    ...overrides,
  };
}

describe('generarEtiquetasLoteUseCase', () => {
  it('devuelve PET_CHAPA_LOTE_NOT_FOUND si el lote no existe o es de otra empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {});

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PET_CHAPA_LOTE_NOT_FOUND');
    expect(repo.findCodigosDeLote).not.toHaveBeenCalled();
  });

  it('devuelve VALIDATION_ERROR si el lote no tiene códigos', async () => {
    const repo = fakeRepo({ findCodigosDeLote: vi.fn().mockResolvedValue({ success: true, data: [] }) });

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toBe('El lote no tiene chapas');
    }
  });

  it('devuelve PET_CODIGO_INVALIDO sin etiquetas si un código no supera esCodigoChapaValido', async () => {
    const repo = fakeRepo({ findCodigosDeLote: vi.fn().mockResolvedValue({ success: true, data: ['BASURA'] }) });

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {});

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PET_CODIGO_INVALIDO');
  });

  describe('con 1200 códigos', () => {
    const codigos = Array.from({ length: 1200 }, (_, i) => codigoValido(i + 1));
    const repo = fakeRepo({ findCodigosDeLote: vi.fn().mockResolvedValue({ success: true, data: codigos }) });

    it('reparte en bloques de POR_PDF sin códigos repetidos, totalPaginas correcto', async () => {
      const totalPaginas = Math.ceil(1200 / POR_PDF);
      const pagina1 = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, { pagina: 1 });
      const pagina2 = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, { pagina: 2 });

      expect(pagina1.success && pagina1.data.etiquetas).toHaveLength(POR_PDF);
      if (pagina1.success) expect(pagina1.data.totalPaginas).toBe(totalPaginas);
      if (pagina2.success) {
        const todosLosCodigos = [...pagina1.success ? pagina1.data.etiquetas.map((e) => e.codigo) : [], ...pagina2.data.etiquetas.map((e) => e.codigo)];
        expect(new Set(todosLosCodigos).size).toBe(todosLosCodigos.length);
      }
    });

    it('una página fuera de rango devuelve VALIDATION_ERROR', async () => {
      const totalPaginas = Math.ceil(1200 / POR_PDF);
      const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, { pagina: totalPaginas + 1 });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('muestra === true cuando perfilPublicoLive es false', async () => {
    const repo = fakeRepo();

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {}, { perfilPublicoLive: false });

    expect(result.success && result.data.muestra).toBe(true);
  });

  it('muestra === false cuando perfilPublicoLive es true', async () => {
    const repo = fakeRepo();

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {}, { perfilPublicoLive: true });

    expect(result.success && result.data.muestra).toBe(false);
  });

  it('cada etiqueta lleva la URL del perfil (R-QR.14.2: nunca teléfono ni otro dato de contacto)', async () => {
    const repo = fakeRepo();

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {});

    expect(result.success).toBe(true);
    if (result.success) {
      for (const e of result.data.etiquetas) {
        expect(e.url).toBe(`${URL_TIENDA_MASCOTAS}/m/${e.codigo}`);
      }
      expect(JSON.stringify(result.data)).not.toMatch(/telefono|email/i);
    }
  });
});
