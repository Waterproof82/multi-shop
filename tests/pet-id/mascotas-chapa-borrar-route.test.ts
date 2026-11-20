/**
 * `POST /api/admin/mascotas/chapas/[codigo]/borrar` (sdd pet-id-qr-profile,
 * Fase 6, DD12/R-QR.1.3). Mismo patrón de mocks que
 * `mascotas-lote-chapas-route.test.ts`, salvo que aquí `requireRole` NO se
 * mockea: es la propia puerta añadida por esta ruta (un rol admitido por
 * `resolveMascotasAdminContext` pero no `admin`/`superadmin` debe caer en
 * 403 sin llegar al caso de uso).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const resolveMascotasAdminContextMock = vi.fn();
vi.mock('@/core/infrastructure/api/mascotas-admin-context', () => ({
  resolveMascotasAdminContext: (...a: unknown[]) => resolveMascotasAdminContextMock(...(a as [])),
}));

const getPetChapaAdminRepositoryMock = vi.fn(() => ({}));
const getAuditLogRepositoryMock = vi.fn(() => ({}));
vi.mock('@/core/infrastructure/database', () => ({
  getPetChapaAdminRepository: (...a: unknown[]) => getPetChapaAdminRepositoryMock(...(a as [])),
  getAuditLogRepository: (...a: unknown[]) => getAuditLogRepositoryMock(...(a as [])),
}));

const borrarDatosChapaUseCaseMock = vi.fn();
vi.mock('@/core/application/use-cases/mascotas/borrarDatosChapa.use-case', () => ({
  borrarDatosChapaUseCase: (...a: unknown[]) => borrarDatosChapaUseCaseMock(...(a as [])),
}));

const { POST } = await import('@/app/api/admin/mascotas/chapas/[codigo]/borrar/route');

const EMPRESA_ID = 'empresa-1';
const CODIGO = 'M-AAAA-1111-X';

function rutaParams(): { params: Promise<{ codigo: string }> } {
  return { params: Promise.resolve({ codigo: CODIGO }) };
}

function peticion(rol: string): NextRequest {
  return new NextRequest(`https://admin.local/api/admin/mascotas/chapas/${CODIGO}/borrar`, {
    method: 'POST',
    headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-id': 'admin-1', 'x-admin-rol': rol }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: EMPRESA_ID, isSuperAdmin: false, error: null });
  borrarDatosChapaUseCaseMock.mockResolvedValue({ success: true, data: { codigo: CODIGO } });
});

describe('POST /api/admin/mascotas/chapas/[codigo]/borrar', () => {
  it('propaga el error de resolveMascotasAdminContext sin llamar al caso de uso', async () => {
    const forbidden = NextResponse.json({ error: 'Módulo no disponible' }, { status: 403 });
    resolveMascotasAdminContextMock.mockResolvedValue({ empresaId: null, isSuperAdmin: false, error: forbidden });

    const res = await POST(peticion('admin'), rutaParams());

    expect(res.status).toBe(403);
    expect(borrarDatosChapaUseCaseMock).not.toHaveBeenCalled();
  });

  it('un rol admitido por el contexto pero no admin/superadmin recibe 403 sin llamar al caso de uso (DD12)', async () => {
    const res = await POST(peticion('manager'), rutaParams());

    expect(res.status).toBe(403);
    expect(borrarDatosChapaUseCaseMock).not.toHaveBeenCalled();
  });

  it('sin x-admin-rol recibe 403 sin llamar al caso de uso', async () => {
    const req = new NextRequest(`https://admin.local/api/admin/mascotas/chapas/${CODIGO}/borrar`, {
      method: 'POST',
      headers: new Headers({ 'x-empresa-id': EMPRESA_ID, 'x-admin-id': 'admin-1' }),
    });

    const res = await POST(req, rutaParams());

    expect(res.status).toBe(403);
    expect(borrarDatosChapaUseCaseMock).not.toHaveBeenCalled();
  });

  it('con rol admin, 200 y delega en el caso de uso con el código y el actor', async () => {
    const res = await POST(peticion('admin'), rutaParams());

    expect(res.status).toBe(200);
    expect(borrarDatosChapaUseCaseMock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), EMPRESA_ID, CODIGO,
      expect.objectContaining({ actorId: 'admin-1', actorTipo: 'admin' }),
    );
    expect(await res.json()).toEqual({ codigo: CODIGO });
  });

  it('con rol superadmin, 200', async () => {
    const res = await POST(peticion('superadmin'), rutaParams());

    expect(res.status).toBe(200);
  });

  it('PET_CHAPA_NOT_FOUND del caso de uso se propaga con handleResult → 404', async () => {
    borrarDatosChapaUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'PET_CHAPA_NOT_FOUND', message: 'Chapa no encontrada o ya libre', module: 'use-case' },
    });

    const res = await POST(peticion('admin'), rutaParams());

    expect(res.status).toBe(404);
  });
});
