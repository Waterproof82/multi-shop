/**
 * `GET /api/admin/mascotas/lotes/[id]/etiquetas` (sdd pet-id-qr-profile,
 * Fase 8). Mismo patrón de mocks que `etiquetas-route.test.ts` de
 * kit-caducidad: se mockea `resolveMascotasAdminContext`, el caso de uso y
 * el renderer; la puerta real ya la vigila
 * `tests/compliance/mascotas-rutas-con-interruptor.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import type { EtiquetasLotePet } from '@/core/domain/entities/pet-chapa-types';

const resolveMascotasAdminContextMock = vi.fn();
vi.mock('@/core/infrastructure/api/mascotas-admin-context', () => ({
  resolveMascotasAdminContext: (...a: unknown[]) => resolveMascotasAdminContextMock(...(a as [])),
}));

const getPetChapaAdminRepositoryMock = vi.fn(() => ({}));
vi.mock('@/core/infrastructure/database', () => ({
  getPetChapaAdminRepository: (...a: unknown[]) => getPetChapaAdminRepositoryMock(...(a as [])),
}));

const generarEtiquetasLoteUseCaseMock = vi.fn();
vi.mock('@/core/application/use-cases/mascotas/generarEtiquetasLote.use-case', () => ({
  generarEtiquetasLoteUseCase: (...a: unknown[]) => generarEtiquetasLoteUseCaseMock(...(a as [])),
}));

const renderEtiquetasChapaPdfMock = vi.fn();
vi.mock('@/core/infrastructure/pdf/etiquetas-chapa.renderer', () => ({
  renderEtiquetasChapaPdf: (...a: unknown[]) => renderEtiquetasChapaPdfMock(...(a as [])),
}));

const { GET } = await import('@/app/api/admin/mascotas/lotes/[id]/etiquetas/route');

const EMPRESA_ID = 'empresa-1';
const LOTE_ID = 'lote-1';

function peticion(query = ''): NextRequest {
  return new NextRequest(`https://admin.local/api/admin/mascotas/lotes/${LOTE_ID}/etiquetas${query}`, {
    headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-rol': 'admin' }),
  });
}

function rutaParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: LOTE_ID }) };
}

// código con '/', '"' (inyección de Content-Disposition) → limpiado a "L01".
const loteOk: EtiquetasLotePet = {
  codigoLote: 'L/01"',
  etiquetas: [{ codigo: 'M-AAAA-1111-X', url: 'https://pedidos.kitemergenciacanarias.es/m/M-AAAA-1111-X' }],
  muestra: true,
  pagina: 1,
  totalPaginas: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: EMPRESA_ID, isSuperAdmin: false, error: null });
  generarEtiquetasLoteUseCaseMock.mockResolvedValue({ success: true, data: loteOk });
  renderEtiquetasChapaPdfMock.mockResolvedValue(Readable.from([Buffer.from('%PDF-1.7 fake')]));
});

describe('GET /api/admin/mascotas/lotes/[id]/etiquetas', () => {
  it('propaga el error de resolveMascotasAdminContext sin llamar al caso de uso (403/503)', async () => {
    const forbidden = NextResponse.json({ error: 'Módulo no disponible' }, { status: 403 });
    resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: null, isSuperAdmin: false, error: forbidden });

    const res = await GET(peticion(), rutaParams());

    expect(res.status).toBe(403);
    expect(generarEtiquetasLoteUseCaseMock).not.toHaveBeenCalled();
    expect(renderEtiquetasChapaPdfMock).not.toHaveBeenCalled();
  });

  it('200 con cabeceras de PDF y nombre de fichero limpio + sufijo -MUESTRA', async () => {
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

  it('sin la marca de muestra, el nombre de fichero no lleva -MUESTRA', async () => {
    generarEtiquetasLoteUseCaseMock.mockResolvedValue({ success: true, data: { ...loteOk, muestra: false } });

    const res = await GET(peticion(), rutaParams());

    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="etiquetas-L01-1.pdf"');
  });

  it('pasa ?pagina= al caso de uso; su rechazo sale en 400 vía handleResult', async () => {
    generarEtiquetasLoteUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Número de página inválido', module: 'use-case' },
    });

    const res = await GET(peticion('?pagina=0'), rutaParams());

    expect(res.status).toBe(400);
    expect(generarEtiquetasLoteUseCaseMock).toHaveBeenCalledWith(
      expect.anything(), EMPRESA_ID, LOTE_ID, expect.objectContaining({ pagina: '0' }),
    );
    expect(renderEtiquetasChapaPdfMock).not.toHaveBeenCalled();
  });

  it('error del caso de uso (lote ajeno/inexistente) se propaga con handleResult → 404', async () => {
    generarEtiquetasLoteUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'PET_CHAPA_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' },
    });

    const res = await GET(peticion(), rutaParams());

    expect(res.status).toBe(404);
  });
});
