/**
 * `GET/POST /api/admin/mascotas/lotes/[id]/chapas` (sdd pet-id-qr-profile,
 * Fase 5). GET = recuento sin PII; POST = generar N códigos. Mismo patrón de
 * mocks que `etiquetas-route.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const resolveMascotasAdminContextMock = vi.fn();
vi.mock('@/core/infrastructure/api/mascotas-admin-context', () => ({
  resolveMascotasAdminContext: (...a: unknown[]) => resolveMascotasAdminContextMock(...(a as [])),
}));

const getPetChapaAdminRepositoryMock = vi.fn(() => ({}));
vi.mock('@/core/infrastructure/database', () => ({
  getPetChapaAdminRepository: (...a: unknown[]) => getPetChapaAdminRepositoryMock(...(a as [])),
}));

const obtenerRecuentoLoteUseCaseMock = vi.fn();
vi.mock('@/core/application/use-cases/mascotas/obtenerRecuentoLote.use-case', () => ({
  obtenerRecuentoLoteUseCase: (...a: unknown[]) => obtenerRecuentoLoteUseCaseMock(...(a as [])),
}));

const generarCodigosChapaUseCaseMock = vi.fn();
vi.mock('@/core/application/use-cases/mascotas/generarCodigosChapa.use-case', () => ({
  generarCodigosChapaUseCase: (...a: unknown[]) => generarCodigosChapaUseCaseMock(...(a as [])),
}));

const { GET, POST } = await import('@/app/api/admin/mascotas/lotes/[id]/chapas/route');

const EMPRESA_ID = 'empresa-1';
const LOTE_ID = 'lote-1';

function rutaParams(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: LOTE_ID }) };
}

function peticionGet(): NextRequest {
  return new NextRequest(`https://admin.local/api/admin/mascotas/lotes/${LOTE_ID}/chapas`, {
    headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-rol': 'admin' }),
  });
}

function peticionPost(body: unknown): NextRequest {
  return new NextRequest(`https://admin.local/api/admin/mascotas/lotes/${LOTE_ID}/chapas`, {
    method: 'POST',
    headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-rol': 'admin', 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: EMPRESA_ID, isSuperAdmin: false, error: null });
  obtenerRecuentoLoteUseCaseMock.mockResolvedValue({ success: true, data: { libre: 1, pendiente: 2, activa: 3 } });
  generarCodigosChapaUseCaseMock.mockResolvedValue({ success: true, data: ['M-AAAA-1111-X'] });
});

describe('GET /api/admin/mascotas/lotes/[id]/chapas', () => {
  it('propaga el error de resolveMascotasAdminContext sin llamar al caso de uso', async () => {
    const forbidden = NextResponse.json({ error: 'Módulo no disponible' }, { status: 403 });
    resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: null, isSuperAdmin: false, error: forbidden });

    const res = await GET(peticionGet(), rutaParams());

    expect(res.status).toBe(403);
    expect(obtenerRecuentoLoteUseCaseMock).not.toHaveBeenCalled();
  });

  it('200 con el recuento por estado, nunca un campo de PII', async () => {
    const res = await GET(peticionGet(), rutaParams());

    expect(res.status).toBe(200);
    expect(obtenerRecuentoLoteUseCaseMock).toHaveBeenCalledWith(expect.anything(), EMPRESA_ID, LOTE_ID);
    const body = await res.json();
    expect(body).toEqual({ libre: 1, pendiente: 2, activa: 3 });
    expect(JSON.stringify(body)).not.toMatch(/email|telefono|nombre|foto/i);
  });

  it('lote inexistente/ajeno se propaga con handleResult → 404', async () => {
    obtenerRecuentoLoteUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'PET_CHAPA_LOTE_NOT_FOUND', message: 'Lote no encontrado', module: 'use-case' },
    });

    const res = await GET(peticionGet(), rutaParams());

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/mascotas/lotes/[id]/chapas', () => {
  it('201 con los códigos generados', async () => {
    const res = await POST(peticionPost({ cantidad: 1 }), rutaParams());

    expect(res.status).toBe(201);
    expect(generarCodigosChapaUseCaseMock).toHaveBeenCalledWith(
      expect.anything(), EMPRESA_ID, LOTE_ID, { cantidad: 1 },
    );
    expect(await res.json()).toEqual(['M-AAAA-1111-X']);
  });

  it('cuerpo no-JSON responde 400 sin llamar al caso de uso', async () => {
    const req = new NextRequest(`https://admin.local/api/admin/mascotas/lotes/${LOTE_ID}/chapas`, {
      method: 'POST',
      headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-rol': 'admin', 'content-type': 'application/json' }),
      body: '{no-es-json',
    });

    const res = await POST(req, rutaParams());

    expect(res.status).toBe(400);
    expect(generarCodigosChapaUseCaseMock).not.toHaveBeenCalled();
  });

  it('CONFLICT (reintentos agotados) se propaga con handleResultWithStatus → 409', async () => {
    generarCodigosChapaUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'CONFLICT', message: 'Se generaron 0 de 3 códigos', module: 'use-case' },
    });

    const res = await POST(peticionPost({ cantidad: 3 }), rutaParams());

    expect(res.status).toBe(409);
  });
});
