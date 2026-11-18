import { describe, expect, it, vi } from 'vitest';
import { generarEtiquetasLoteUseCase } from '@/core/application/use-cases/kits/generarEtiquetasLote.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { KitLote, KitSerie } from '@/core/domain/entities/kit-caducidad-types';
import { URL_LISTA_MOCHILA } from '@/lib/kit-caducidad/etiqueta-urls';
import { generarSerie } from '@/lib/kit-caducidad/serie';
import { POR_PDF } from '@/lib/kit-caducidad/etiqueta-layout';

// sdd kit-expiry-m5 R-M5.1/R-M5.2/R-M5.4: el caso de uso devuelve DATOS para
// la etiqueta (sin React ni qrcode, DD1) — se prueba con un repositorio
// falso, como el resto de casos de uso de kits.

const EMPRESA_ID = 'empresa-1';
const LOTE_ID = 'lote-1';

const loteEjemplo: KitLote = {
  id: LOTE_ID,
  empresaId: EMPRESA_ID,
  productoId: 'producto-1',
  codigo: 'KEC-001',
  fechaMontaje: '2026-11-01',
  createdAt: '2026-11-01T00:00:00.000Z',
};

function serieValida(n: number): string {
  return generarSerie(() => Uint8Array.from([n >> 24 & 0xff, n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, (n * 7) & 0xff]));
}

function kitSerie(serie: string): KitSerie {
  return { serie, loteId: LOTE_ID, empresaId: EMPRESA_ID, pedidoId: null, registradoAt: null, createdAt: '2026-11-01T00:00:00.000Z' };
}

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
    findSeriesDeLote: vi.fn().mockResolvedValue({ success: true, data: [kitSerie(serieValida(1))] }),
    findRegistrados: vi.fn(),
    findContacto: vi.fn(),
    findKitPublico: vi.fn(),
    findCaducidadesEfectivas: vi.fn(),
    ...overrides,
  };
}

describe('generarEtiquetasLoteUseCase', () => {
  it('devuelve KIT_LOTE_NOT_FOUND si el lote no existe o es de otra empresa', async () => {
    const repo = fakeRepo({ findLoteById: vi.fn().mockResolvedValue({ success: true, data: null }) });

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {});

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_LOTE_NOT_FOUND');
    expect(repo.findSeriesDeLote).not.toHaveBeenCalled();
  });

  it('devuelve VALIDATION_ERROR si el lote no tiene series (R-M5.1.5)', async () => {
    const repo = fakeRepo({ findSeriesDeLote: vi.fn().mockResolvedValue({ success: true, data: [] }) });

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toBe('El lote no tiene series');
    }
  });

  it('devuelve KIT_SERIE_INVALIDA sin etiquetas si una serie no supera esSerieValida (DD6)', async () => {
    const repo = fakeRepo({ findSeriesDeLote: vi.fn().mockResolvedValue({ success: true, data: [kitSerie('KEC-BASURA')] }) });

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {});

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_SERIE_INVALIDA');
  });

  describe('con 1200 series', () => {
    const series = Array.from({ length: 1200 }, (_, i) => kitSerie(serieValida(i + 1)));
    const repo = fakeRepo({ findSeriesDeLote: vi.fn().mockResolvedValue({ success: true, data: series }) });

    it('reparte 500/500/200 sin series repetidas y totalPaginas === 3', async () => {
      const pagina1 = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, { pagina: 1 });
      const pagina2 = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, { pagina: 2 });
      const pagina3 = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, { pagina: 3 });

      expect(pagina1.success && pagina1.data.etiquetas).toHaveLength(500);
      expect(pagina2.success && pagina2.data.etiquetas).toHaveLength(500);
      expect(pagina3.success && pagina3.data.etiquetas).toHaveLength(200);
      if (pagina1.success && pagina2.success && pagina3.success) {
        expect(pagina1.data.totalPaginas).toBe(3);
        expect(pagina2.data.totalPaginas).toBe(3);
        expect(pagina3.data.totalPaginas).toBe(3);

        const todasLasSeries = [
          ...pagina1.data.etiquetas.map((e) => e.serie),
          ...pagina2.data.etiquetas.map((e) => e.serie),
          ...pagina3.data.etiquetas.map((e) => e.serie),
        ];
        expect(new Set(todasLasSeries).size).toBe(1200);
      }
    });

    it('pagina=4 devuelve VALIDATION_ERROR (no existe)', async () => {
      const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, { pagina: 4 });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('muestra === true cuando estadoPublicoLive es false', async () => {
    const repo = fakeRepo();

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {}, { estadoPublicoLive: false });

    expect(result.success && result.data.muestra).toBe(true);
  });

  it('muestra === false cuando estadoPublicoLive es true', async () => {
    const repo = fakeRepo();

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {}, { estadoPublicoLive: true });

    expect(result.success && result.data.muestra).toBe(false);
  });

  it('urlLista es la constante URL_LISTA_MOCHILA y el resultado no lleva email/telefono', async () => {
    const repo = fakeRepo();

    const result = await generarEtiquetasLoteUseCase(repo, EMPRESA_ID, LOTE_ID, {});

    expect(result.success && result.data.urlLista).toBe(URL_LISTA_MOCHILA);
    if (result.success) {
      expect(result.data).not.toHaveProperty('email');
      expect(result.data).not.toHaveProperty('telefono');
      expect(JSON.stringify(result.data)).not.toMatch(/email|telefono/i);
    }
  });

  it('usa POR_PDF como tope de etiquetas por página', () => {
    expect(POR_PDF).toBe(500);
  });
});
