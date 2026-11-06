/**
 * CartaRoute — pinning test (PR0 tenant-resolution, tarea 0.2).
 *
 * Fija el comportamiento ACTUAL para un host sin empresa asociada: la
 * carta responde 200 con "Dominio no configurado", NUNCA un 404 (spec
 * amendment F1, acordada con el propietario el 2026-11-03). Debe seguir
 * pasando sin cambios tras delegar la resolución a `resolverEmpresaPublica`
 * (tarea 0.4).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const resolverEmpresaPublica = vi.fn();
const getCachedMenu = vi.fn();
const getModalidadesEntregaPublicas = vi.fn();
const getSeccionesLandingActivas = vi.fn();

vi.mock('@/lib/server-services', () => ({
  resolverEmpresaPublica: (...args: unknown[]) => resolverEmpresaPublica(...args),
  getCachedMenu: (...args: unknown[]) => getCachedMenu(...args),
  getModalidadesEntregaPublicas: (...args: unknown[]) => getModalidadesEntregaPublicas(...args),
  getSeccionesLandingActivas: (...args: unknown[]) => getSeccionesLandingActivas(...args),
}));

vi.mock('@/lib/domain-utils', () => ({
  getDomainFromHeaders: async () => 'desconocido.com',
  parseMainDomain: (d: string) => d,
}));

import { CartaRoute } from '@/components/carta-route';

beforeEach(() => {
  vi.clearAllMocks();
  resolverEmpresaPublica.mockResolvedValue({ empresa: null, isPedidos: false });
});

describe('CartaRoute — host sin empresa asociada', () => {
  it('pinta "Dominio no configurado" (200, no notFound/redirect) — spec amendment F1', async () => {
    const elemento = await CartaRoute({ searchParams: Promise.resolve({}) });
    render(elemento);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Dominio no configurado' })
    ).toBeInTheDocument();
    expect(screen.getByText('Esta web no está asociada a ninguna empresa.')).toBeInTheDocument();
    // Ninguna dependencia posterior (menú, modalidades, secciones) debe
    // invocarse: el early return corta el flujo antes de llegar a ellas.
    expect(getCachedMenu).not.toHaveBeenCalled();
    expect(getModalidadesEntregaPublicas).not.toHaveBeenCalled();
    expect(getSeccionesLandingActivas).not.toHaveBeenCalled();
  });
});
