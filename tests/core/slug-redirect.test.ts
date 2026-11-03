/**
 * cargarPaginaProducto — redirect de slugs históricos (product-detail-pages
 * PR5, tarea 5.3). El histórico SOLO se consulta cuando el slug vivo no
 * resuelve nada (spec PR5: "live slug wins over history", "no redirect
 * loops"); la regla de negocio en sí (activo + slug no nulo) está probada en
 * tests/core/slug-historico-use-case.test.ts — aquí solo el cableado del
 * loader (orden de lookup, un solo hop, aislamiento por empresaId).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const resolverEmpresaPublica = vi.fn();
const getCachedMenu = vi.fn();
const resolverSlugActual = vi.fn();

vi.mock('@/lib/server-services', () => ({
  resolverEmpresaPublica: (...args: unknown[]) => resolverEmpresaPublica(...args),
  getCachedMenu: (...args: unknown[]) => getCachedMenu(...args),
}));

vi.mock('@/lib/domain-utils', () => ({
  getDomainFromHeaders: async () => 'alma-de-arena.com',
}));

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

describe('cargarPaginaProducto — histórico de slugs (PR5)', () => {
  it('redirige al slug ACTUAL cuando el slug pedido es un histórico resuelto', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [item({ slug: 'kit-basico-24h' })] }] });
    resolverSlugActual.mockResolvedValue({ success: true, data: 'kit-basico-24h' });

    const resultado = await cargarPaginaProducto('kit-basico');

    expect(resultado).toEqual({ tipo: 'redirigir', slug: 'kit-basico-24h' });
    expect(resolverSlugActual).toHaveBeenCalledWith('e1', 'kit-basico');
  });

  it('un slug VIVO siempre gana: si el slug pedido ya resuelve en el menú, el histórico no se consulta', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [item({ slug: 'kit-basico' })] }] });

    const resultado = await cargarPaginaProducto('kit-basico');

    expect(resultado.tipo).toBe('ok');
    expect(resolverSlugActual).not.toHaveBeenCalled();
  });

  it('no-encontrado: el slug antiguo pertenece a OTRO tenant (aislamiento por empresaId)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa({ id: 'empresaB' }), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [] }] });
    // El use case ya resuelve esto a null para empresaB — el histórico es de empresaA.
    resolverSlugActual.mockResolvedValue({ success: true, data: null });

    const resultado = await cargarPaginaProducto('kit-basico-de-a');

    expect(resultado).toEqual({ tipo: 'no-encontrado' });
    expect(resolverSlugActual).toHaveBeenCalledWith('empresaB', 'kit-basico-de-a');
  });

  it('no-encontrado: el histórico apunta a un producto ya inactivo', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [] }] });
    // El use case ya aplica la regla "inactivo → null" (ver su propio test).
    resolverSlugActual.mockResolvedValue({ success: true, data: null });

    expect(await cargarPaginaProducto('kit-basico-viejo')).toEqual({ tipo: 'no-encontrado' });
  });

  it('A→B→A resuelve en un solo salto, sin volver a pasar por B', async () => {
    // Slug pedido es B (histórico); el use case ya sabe que el slug vivo
    // actual es A — el loader solo hace UNA llamada, nunca encadena.
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [item({ slug: 'A' })] }] });
    resolverSlugActual.mockResolvedValue({ success: true, data: 'A' });

    const resultado = await cargarPaginaProducto('B');

    expect(resultado).toEqual({ tipo: 'redirigir', slug: 'A' });
    expect(resolverSlugActual).toHaveBeenCalledTimes(1);
  });

  it('lanza (→500, no 404) si el lookup de histórico falla', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    getCachedMenu.mockResolvedValue({ data: [{ id: 'c1', label: 'Kits', items: [] }] });
    resolverSlugActual.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'fallo de postgrest', module: 'repository' },
    });

    await expect(cargarPaginaProducto('kit-basico')).rejects.toThrow('fallo de postgrest');
  });
});
