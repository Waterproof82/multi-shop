/**
 * cargarPaginaProducto — loader de /producto/[slug] (product-detail-pages PR3).
 *
 * Unión discriminada: 'ok' | 'redirigir' (histórico de slugs, PR5 — ver
 * tests/core/slug-redirect.test.ts) | 'no-encontrado'. Cubre aquí las tres
 * rutas que colapsan a 'no-encontrado' cuando TAMPOCO hay histórico (spec
 * PR3: restaurant regression guard, cross-tenant slug 404, inactive
 * product 404) — la página solo traduce ese resultado a un notFound() real
 * (ver tests/core/producto-page-guard.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const resolverEmpresaPublica = vi.fn();
const getCachedMenu = vi.fn();
const resolverSlugActual = vi.fn().mockResolvedValue({ success: true, data: null });

vi.mock('@/lib/server-services', () => ({
  resolverEmpresaPublica: (...args: unknown[]) => resolverEmpresaPublica(...args),
  getCachedMenu: (...args: unknown[]) => getCachedMenu(...args),
}));

vi.mock('@/lib/domain-utils', () => ({
  getDomainFromHeaders: async () => 'alma-de-arena.com',
}));

// Las tres rutas de este archivo que llegan a 'no-encontrado' también pasan
// por el lookup de histórico (PR5): sin histórico, siguen siendo
// 'no-encontrado'. El comportamiento del lookup en sí vive en
// slug-redirect.test.ts.
vi.mock('@/core/infrastructure/database', () => ({
  getSlugHistoricoUseCase: () => ({ resolverSlugActual: (...args: unknown[]) => resolverSlugActual(...args) }),
}));

import { cargarPaginaProducto } from '@/lib/catalogo/cargar-producto';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';
import type { EmpresaPublic } from '@/core/domain/entities/types';

function item(overrides: Partial<MenuItemVM> = {}): MenuItemVM {
  return { id: 'p1', name: 'Kit básico', price: 24, category: 'kits', slug: 'kit-basico', ...overrides };
}

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return { id: 'e1', tipo: 'tienda', ...overrides } as unknown as EmpresaPublic;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cargarPaginaProducto', () => {
  it('ok: devuelve el producto cuando el tenant es tienda y el slug existe en su menú', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [item()] }] });

    const resultado = await cargarPaginaProducto('kit-basico');

    expect(resultado).toMatchObject({ tipo: 'ok', isPedidos: false, baseUrl: 'https://alma-de-arena.com' });
    if (resultado.tipo === 'ok') expect(resultado.item.id).toBe('p1');
  });

  it('no-encontrado: tenant restaurante (regresión — nunca sirve /producto)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa({ tipo: 'restaurante' }), isPedidos: false });

    const resultado = await cargarPaginaProducto('kit-basico');

    expect(resultado).toEqual({ tipo: 'no-encontrado' });
    expect(getCachedMenu).not.toHaveBeenCalled();
  });

  it('no-encontrado: host sin empresa asociada', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: null, isPedidos: false });

    expect(await cargarPaginaProducto('kit-basico')).toEqual({ tipo: 'no-encontrado' });
    expect(getCachedMenu).not.toHaveBeenCalled();
  });

  it('no-encontrado: slug existente solo en OTRO tenant (aislamiento por empresaId vía getCachedMenu)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa({ id: 'empresaA' }), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [item({ slug: 'kit-basico-de-a' })] }] });

    expect(await cargarPaginaProducto('kit-basico-de-b')).toEqual({ tipo: 'no-encontrado' });
  });

  it('no-encontrado: producto inactivo (GetMenuUseCase ya lo filtra: ausente del VM)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [] }] });

    expect(await cargarPaginaProducto('kit-basico')).toEqual({ tipo: 'no-encontrado' });
  });

  it('lanza (→500, no 404) cuando getCachedMenu devuelve un error transitorio', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    getCachedMenu.mockResolvedValue({ error: 'fallo de postgrest' });

    await expect(cargarPaginaProducto('kit-basico')).rejects.toThrow('fallo de postgrest');
  });
});
