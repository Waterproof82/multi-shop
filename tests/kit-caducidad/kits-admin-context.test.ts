/**
 * `resolveKitsAdminContext()` — puerta de servidor de /api/admin/kits/* (DD1).
 *
 * No es un proxy (solo conoce el `x-empresa-id` del JWT, no el `?empresaId=`
 * del superadmin): es un helper de ruta que primero resuelve la empresa
 * OBJETIVO con `resolveAdminContextWithEmpresa` y, sobre esa empresa, mira
 * `kitsCaducidadHabilitadoParaEmpresa` (R-M4.1.4, R-M4.1.5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const rateLimitAdminMock = vi.fn(async () => null as unknown);
vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  rateLimitAdmin: (...a: unknown[]) => rateLimitAdminMock(...(a as [])),
}));

const kitsHabilitadoMock = vi.fn(async () => true);
vi.mock('@/lib/kit-caducidad/kits-habilitado', () => ({
  kitsCaducidadHabilitadoParaEmpresa: (...a: unknown[]) => kitsHabilitadoMock(...(a as [])),
}));

const { resolveKitsAdminContext } = await import('@/core/infrastructure/api/kits-admin-context');

function peticion(path: string, cabeceras: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://admin.local${path}`, { headers: new Headers(cabeceras) });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitAdminMock.mockResolvedValue(null);
  kitsHabilitadoMock.mockResolvedValue(true);
});

describe('resolveKitsAdminContext', () => {
  it('pasa cuando el flag está activo para la empresa del admin', async () => {
    const ctx = await resolveKitsAdminContext(
      peticion('/api/admin/kits/lotes', { 'x-empresa-id': 'e1', 'x-admin-rol': 'admin' }),
    );
    expect(ctx.error).toBeNull();
    expect(ctx.empresaId).toBe('e1');
    expect(kitsHabilitadoMock).toHaveBeenCalledWith('e1');
  });

  it('responde 403 sin datos si el flag está desactivado', async () => {
    kitsHabilitadoMock.mockResolvedValue(false);
    const ctx = await resolveKitsAdminContext(
      peticion('/api/admin/kits/lotes', { 'x-empresa-id': 'e1', 'x-admin-rol': 'admin' }),
    );
    expect(ctx.empresaId).toBeNull();
    expect(ctx.error?.status).toBe(403);
    await expect(ctx.error?.json()).resolves.not.toHaveProperty('lotes');
  });

  it('responde 503 (cierra) si falla la comprobación del flag, sin dejar pasar', async () => {
    kitsHabilitadoMock.mockRejectedValue(new Error('conexión perdida'));
    const ctx = await resolveKitsAdminContext(
      peticion('/api/admin/kits/lotes', { 'x-empresa-id': 'e1', 'x-admin-rol': 'admin' }),
    );
    expect(ctx.empresaId).toBeNull();
    expect(ctx.error?.status).toBe(503);
  });

  it('el superadmin con ?empresaId= usa el flag de la empresa OBJETIVO, no un privilegio implícito', async () => {
    const ctx = await resolveKitsAdminContext(
      peticion('/api/admin/kits/lotes?empresaId=3fa85f64-5717-4562-b3fc-2c963f66afa6', { 'x-admin-rol': 'superadmin' }),
    );
    expect(kitsHabilitadoMock).toHaveBeenCalledWith('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(ctx.empresaId).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
  });

  it('propaga el error de autenticación/rol sin llegar a comprobar el flag', async () => {
    const ctx = await resolveKitsAdminContext(peticion('/api/admin/kits/lotes'));
    expect(ctx.error?.status).toBe(401);
    expect(kitsHabilitadoMock).not.toHaveBeenCalled();
  });
});
