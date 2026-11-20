/**
 * `POST /api/admin/mascotas/lotes` (sdd pet-id-qr-profile, Fase 5). Mismo
 * patrón de mocks que `etiquetas-route.test.ts`: se mockea
 * `resolveMascotasAdminContext`, el repositorio y el caso de uso; la puerta
 * real ya la vigila `tests/compliance/mascotas-rutas-con-interruptor.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { PetChapaLote } from '@/core/domain/entities/pet-chapa-types';

const resolveMascotasAdminContextMock = vi.fn();
vi.mock('@/core/infrastructure/api/mascotas-admin-context', () => ({
  resolveMascotasAdminContext: (...a: unknown[]) => resolveMascotasAdminContextMock(...(a as [])),
}));

const getPetChapaAdminRepositoryMock = vi.fn(() => ({}));
vi.mock('@/core/infrastructure/database', () => ({
  getPetChapaAdminRepository: (...a: unknown[]) => getPetChapaAdminRepositoryMock(...(a as [])),
}));

const crearLoteChapasUseCaseMock = vi.fn();
vi.mock('@/core/application/use-cases/mascotas/crearLoteChapas.use-case', () => ({
  crearLoteChapasUseCase: (...a: unknown[]) => crearLoteChapasUseCaseMock(...(a as [])),
}));

const { POST } = await import('@/app/api/admin/mascotas/lotes/route');

const EMPRESA_ID = 'empresa-1';

const loteOk: PetChapaLote = {
  id: 'lote-1',
  empresaId: EMPRESA_ID,
  productoId: 'producto-1',
  codigo: 'L01',
  createdAt: '2026-11-20T00:00:00Z',
};

function peticion(body: unknown): NextRequest {
  return new NextRequest('https://admin.local/api/admin/mascotas/lotes', {
    method: 'POST',
    headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-rol': 'admin', 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: EMPRESA_ID, isSuperAdmin: false, error: null });
  crearLoteChapasUseCaseMock.mockResolvedValue({ success: true, data: loteOk });
});

describe('POST /api/admin/mascotas/lotes', () => {
  it('propaga el error de resolveMascotasAdminContext sin llamar al caso de uso (403/503)', async () => {
    const forbidden = NextResponse.json({ error: 'Módulo no disponible' }, { status: 403 });
    resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: null, isSuperAdmin: false, error: forbidden });

    const res = await POST(peticion({ productoId: 'producto-1', codigo: 'L01' }));

    expect(res.status).toBe(403);
    expect(crearLoteChapasUseCaseMock).not.toHaveBeenCalled();
  });

  it('201 con el lote creado, pasa el empresaId del contexto', async () => {
    const res = await POST(peticion({ productoId: 'producto-1', codigo: 'L01' }));

    expect(res.status).toBe(201);
    expect(crearLoteChapasUseCaseMock).toHaveBeenCalledWith(
      expect.anything(), EMPRESA_ID, { productoId: 'producto-1', codigo: 'L01' },
    );
    expect(await res.json()).toEqual(loteOk);
  });

  it('cuerpo no-JSON responde 400 sin llamar al caso de uso', async () => {
    const req = new NextRequest('https://admin.local/api/admin/mascotas/lotes', {
      method: 'POST',
      headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-rol': 'admin', 'content-type': 'application/json' }),
      body: '{no-es-json',
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(crearLoteChapasUseCaseMock).not.toHaveBeenCalled();
  });

  it('error del caso de uso (p. ej. VALIDATION_ERROR del trigger) se propaga con handleResult → 400', async () => {
    crearLoteChapasUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'El producto no es de esta empresa', module: 'use-case' },
    });

    const res = await POST(peticion({ productoId: 'producto-ajeno', codigo: 'L01' }));

    expect(res.status).toBe(400);
  });
});
