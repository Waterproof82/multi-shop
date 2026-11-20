/**
 * `resolveMascotasAdminContext()` — puerta de servidor de /api/admin/mascotas/*
 * (DD12 de design.md, calco de `resolveKitsAdminContext`). Primero resuelve la
 * empresa OBJETIVO con `resolveAdminContextWithEmpresa` y, sobre esa empresa,
 * mira `flagModuloHabilitado(empresaId, 'pet_id_qr_habilitado')`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const rateLimitAdminMock = vi.fn(async () => null as unknown);
vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  rateLimitAdmin: (...a: unknown[]) => rateLimitAdminMock(...(a as [])),
}));

const flagModuloHabilitadoMock = vi.fn(async () => true);
vi.mock('@/lib/empresa/flag-modulo', () => ({
  flagModuloHabilitado: (...a: unknown[]) => flagModuloHabilitadoMock(...(a as [])),
}));

const { resolveMascotasAdminContext } = await import('@/core/infrastructure/api/mascotas-admin-context');

function peticion(path: string, cabeceras: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://admin.local${path}`, { headers: new Headers(cabeceras) });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitAdminMock.mockResolvedValue(null);
  flagModuloHabilitadoMock.mockResolvedValue(true);
});

describe('resolveMascotasAdminContext', () => {
  it('pasa cuando el flag está activo para la empresa del admin', async () => {
    const ctx = await resolveMascotasAdminContext(
      peticion('/api/admin/mascotas/lotes', { 'x-empresa-id': 'e1', 'x-admin-rol': 'admin' }),
    );
    expect(ctx.error).toBeNull();
    expect(ctx.empresaId).toBe('e1');
    expect(flagModuloHabilitadoMock).toHaveBeenCalledWith('e1', 'pet_id_qr_habilitado');
  });

  it('responde 403 sin datos si el flag está desactivado', async () => {
    flagModuloHabilitadoMock.mockResolvedValue(false);
    const ctx = await resolveMascotasAdminContext(
      peticion('/api/admin/mascotas/lotes', { 'x-empresa-id': 'e1', 'x-admin-rol': 'admin' }),
    );
    expect(ctx.empresaId).toBeNull();
    expect(ctx.error?.status).toBe(403);
    await expect(ctx.error?.json()).resolves.not.toHaveProperty('lotes');
  });

  it('responde 503 (cierra) si falla la comprobación del flag, sin dejar pasar', async () => {
    flagModuloHabilitadoMock.mockRejectedValue(new Error('conexión perdida'));
    const ctx = await resolveMascotasAdminContext(
      peticion('/api/admin/mascotas/lotes', { 'x-empresa-id': 'e1', 'x-admin-rol': 'admin' }),
    );
    expect(ctx.empresaId).toBeNull();
    expect(ctx.error?.status).toBe(503);
  });

  it('el superadmin con ?empresaId= usa el flag de la empresa OBJETIVO, no un privilegio implícito', async () => {
    const ctx = await resolveMascotasAdminContext(
      peticion('/api/admin/mascotas/lotes?empresaId=3fa85f64-5717-4562-b3fc-2c963f66afa6', { 'x-admin-rol': 'superadmin' }),
    );
    expect(flagModuloHabilitadoMock).toHaveBeenCalledWith('3fa85f64-5717-4562-b3fc-2c963f66afa6', 'pet_id_qr_habilitado');
    expect(ctx.empresaId).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
  });

  it('propaga el error de autenticación/rol sin llegar a comprobar el flag', async () => {
    const ctx = await resolveMascotasAdminContext(peticion('/api/admin/mascotas/lotes'));
    expect(ctx.error?.status).toBe(401);
    expect(flagModuloHabilitadoMock).not.toHaveBeenCalled();
  });
});
