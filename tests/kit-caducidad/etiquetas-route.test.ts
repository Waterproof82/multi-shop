/**
 * `GET /api/admin/kits/lotes/[id]/etiquetas` (sdd kit-expiry-m5, M5b2).
 *
 * Mismo patrón de mocks que `kits-admin-context.test.ts`: se mockea
 * `resolveKitsAdminContext`, el caso de uso y el renderer; la puerta real ya
 * la vigila `tests/compliance/kits-rutas-con-interruptor.test.ts` (escanea el
 * fichero de la ruta, no hace falta tocarlo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import type { EtiquetasLote } from '@/core/domain/entities/kit-caducidad-types';

const resolveKitsAdminContextMock = vi.fn();
vi.mock('@/core/infrastructure/api/kits-admin-context', () => ({
  resolveKitsAdminContext: (...a: unknown[]) => resolveKitsAdminContextMock(...(a as [])),
}));

const getKitCaducidadRepositoryMock = vi.fn(() => ({}));
vi.mock('@/core/infrastructure/database', () => ({
  getKitCaducidadRepository: (...a: unknown[]) => getKitCaducidadRepositoryMock(...(a as [])),
}));

const generarEtiquetasLoteUseCaseMock = vi.fn();
vi.mock('@/core/application/use-cases/kits/generarEtiquetasLote.use-case', () => ({
  generarEtiquetasLoteUseCase: (...a: unknown[]) => generarEtiquetasLoteUseCaseMock(...(a as [])),
}));

const renderEtiquetasKitPdfMock = vi.fn();
vi.mock('@/core/infrastructure/pdf/etiquetas-kit.renderer', () => ({
  renderEtiquetasKitPdf: (...a: unknown[]) => renderEtiquetasKitPdfMock(...(a as [])),
}));

const { GET } = await import('@/app/api/admin/kits/lotes/[id]/etiquetas/route');

const EMPRESA_ID = 'empresa-1';
const LOTE_ID = 'lote-1';

function peticion(query = ''): NextRequest {
  return new NextRequest(`https://admin.local/api/admin/kits/lotes/${LOTE_ID}/etiquetas${query}`, {
    headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-rol': 'admin' }),
  });
}

function rutaParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: LOTE_ID }) };
}

// DD10: código con '/', '"' (inyección de Content-Disposition) → limpiado a "L01".
const loteOk: EtiquetasLote = {
  codigoLote: 'L/01"',
  etiquetas: [{ serie: 'KEC-0001-A', urlEstado: 'https://pedidos.kitemergenciacanarias.es/kit/KEC-0001-A' }],
  urlLista: 'https://kitemergenciacanarias.es/lista-mochila-emergencia',
  muestra: true,
  pagina: 1,
  totalPaginas: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveKitsAdminContextMock.mockResolvedValue({ empresaId: EMPRESA_ID, isSuperAdmin: false, error: null });
  generarEtiquetasLoteUseCaseMock.mockResolvedValue({ success: true, data: loteOk });
  renderEtiquetasKitPdfMock.mockResolvedValue(Readable.from([Buffer.from('%PDF-1.7 fake')]));
});

describe('GET /api/admin/kits/lotes/[id]/etiquetas', () => {
  it('propaga el error de resolveKitsAdminContext sin llamar al caso de uso (403/503)', async () => {
    const forbidden = NextResponse.json({ error: 'Módulo no disponible' }, { status: 403 });
    resolveKitsAdminContextMock.mockResolvedValue({ empresaId: null, isSuperAdmin: false, error: forbidden });

    const res = await GET(peticion(), rutaParams());

    expect(res.status).toBe(403);
    expect(generarEtiquetasLoteUseCaseMock).not.toHaveBeenCalled();
    expect(renderEtiquetasKitPdfMock).not.toHaveBeenCalled();
  });

  it('200 con cabeceras de PDF y nombre de fichero limpio + sufijo -MUESTRA (R-M5.1.3/DD10/R-M5.4.1)', async () => {
    const res = await GET(peticion(), rutaParams());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="etiquetas-L01-1-MUESTRA.pdf"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(generarEtiquetasLoteUseCaseMock).toHaveBeenCalledWith(
      expect.anything(), EMPRESA_ID, LOTE_ID, expect.objectContaining({ pagina: undefined }),
    );

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.toString('latin1')).toBe('%PDF-1.7 fake');
  });

  it('sin la marca de muestra (R-M5.4.2), el nombre de fichero no lleva -MUESTRA', async () => {
    generarEtiquetasLoteUseCaseMock.mockResolvedValue({ success: true, data: { ...loteOk, muestra: false } });

    const res = await GET(peticion(), rutaParams());

    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="etiquetas-L01-1.pdf"');
  });

  it('pasa ?pagina= a `generarEtiquetasLoteUseCase`; su rechazo (p. ej. pagina=0) sale en 400 vía handleResult', async () => {
    generarEtiquetasLoteUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Número de página inválido', module: 'use-case' },
    });

    const res = await GET(peticion('?pagina=0'), rutaParams());

    expect(res.status).toBe(400);
    expect(generarEtiquetasLoteUseCaseMock).toHaveBeenCalledWith(
      expect.anything(), EMPRESA_ID, LOTE_ID, expect.objectContaining({ pagina: '0' }),
    );
    expect(renderEtiquetasKitPdfMock).not.toHaveBeenCalled();
  });

  it('error del caso de uso (p. ej. lote ajeno/inexistente) se propaga con handleResult → 404', async () => {
    generarEtiquetasLoteUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'KIT_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' },
    });

    const res = await GET(peticion(), rutaParams());

    expect(res.status).toBe(404);
  });
});
