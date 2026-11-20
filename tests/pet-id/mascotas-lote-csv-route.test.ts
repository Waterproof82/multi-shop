/**
 * `GET /api/admin/mascotas/lotes/[id]/csv` (sdd pet-id-qr-profile, Fase 8,
 * R-QR.14.3). Mismo patrón de mocks que `mascotas-lote-etiquetas-route.test.ts`;
 * la puerta real ya la vigila `mascotas-rutas-con-interruptor.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { CsvLotePet } from '@/core/domain/entities/pet-chapa-types';

const resolveMascotasAdminContextMock = vi.fn();
vi.mock('@/core/infrastructure/api/mascotas-admin-context', () => ({
  resolveMascotasAdminContext: (...a: unknown[]) => resolveMascotasAdminContextMock(...(a as [])),
}));

const getPetChapaAdminRepositoryMock = vi.fn(() => ({}));
vi.mock('@/core/infrastructure/database', () => ({
  getPetChapaAdminRepository: (...a: unknown[]) => getPetChapaAdminRepositoryMock(...(a as [])),
}));

const generarCsvLoteUseCaseMock = vi.fn();
vi.mock('@/core/application/use-cases/mascotas/generarCsvLote.use-case', () => ({
  generarCsvLoteUseCase: (...a: unknown[]) => generarCsvLoteUseCaseMock(...(a as [])),
}));

const { GET } = await import('@/app/api/admin/mascotas/lotes/[id]/csv/route');

const EMPRESA_ID = 'empresa-1';
const LOTE_ID = 'lote-1';

function peticion(): NextRequest {
  return new NextRequest(`https://admin.local/api/admin/mascotas/lotes/${LOTE_ID}/csv`, {
    headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-rol': 'admin' }),
  });
}

function rutaParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: LOTE_ID }) };
}

// código con '/', '"' (inyección de Content-Disposition) → limpiado a "L01".
const loteOk: CsvLotePet = {
  codigoLote: 'L/01"',
  etiquetas: [{ codigo: 'M-AAAA-1111-X', url: 'https://pedidos.kitemergenciacanarias.es/m/M-AAAA-1111-X' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: EMPRESA_ID, isSuperAdmin: false, error: null });
  generarCsvLoteUseCaseMock.mockResolvedValue({ success: true, data: loteOk });
});

describe('GET /api/admin/mascotas/lotes/[id]/csv', () => {
  it('propaga el error de resolveMascotasAdminContext sin llamar al caso de uso (403/503)', async () => {
    const forbidden = NextResponse.json({ error: 'Módulo no disponible' }, { status: 403 });
    resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: null, isSuperAdmin: false, error: forbidden });

    const res = await GET(peticion(), rutaParams());

    expect(res.status).toBe(403);
    expect(generarCsvLoteUseCaseMock).not.toHaveBeenCalled();
  });

  it('200 con cabeceras de CSV, nombre de fichero limpio y el cuerpo codigo,url', async () => {
    const res = await GET(peticion(), rutaParams());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="chapas-L01.csv"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const body = await res.text();
    const lineas = body.trim().split('\r\n');
    expect(lineas[0]).toBe('codigo,url');
    expect(lineas[1]).toBe('M-AAAA-1111-X,https://pedidos.kitemergenciacanarias.es/m/M-AAAA-1111-X');
  });

  it('error del caso de uso (lote ajeno/inexistente) se propaga con handleResult → 404', async () => {
    generarCsvLoteUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'PET_CHAPA_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' },
    });

    const res = await GET(peticion(), rutaParams());

    expect(res.status).toBe(404);
  });
});
