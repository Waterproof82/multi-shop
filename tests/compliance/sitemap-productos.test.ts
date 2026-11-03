/**
 * sitemap() — entradas de producto para tenants de tipo tienda
 * (product-detail-pages PR3, "Canonical and sitemap exclusion for
 * canonical_externo" + "Indexable product in sitemap").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolverEmpresaPublica = vi.fn();
const getCachedMenu = vi.fn();

vi.mock('@/lib/server-services', () => ({
  resolverEmpresaPublica: (...args: unknown[]) => resolverEmpresaPublica(...args),
  getCachedMenu: (...args: unknown[]) => getCachedMenu(...args),
}));

vi.mock('@/lib/domain-utils', () => ({
  getDomainFromHeaders: async () => 'alma-de-arena.com',
}));

import sitemap from '@/app/sitemap';
import type { EmpresaPublic } from '@/core/domain/entities/types';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return {
    id: 'e1',
    nombre: 'Alma de Arena',
    tipo: 'tienda',
    descripcion: null,
    deliveryHabilitado: false,
    envioDomicilioHabilitado: false,
    ...overrides,
  } as unknown as EmpresaPublic;
}

function item(overrides: Partial<MenuItemVM> = {}): MenuItemVM {
  return { id: 'p1', name: 'Kit básico', price: 24, category: 'kits', slug: 'kit-basico', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sitemap — productos de tienda', () => {
  it('incluye un producto indexable y excluye el que tiene canonicalExterno', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa() });
    getCachedMenu.mockResolvedValue({
      data: [
        {
          id: 'c1',
          label: 'Kits',
          items: [
            item({ id: 'p1', slug: 'kit-basico' }),
            item({ id: 'p2', slug: 'kit-externo', canonicalExterno: 'https://kitemergenciacanarias.es/kit-externo' }),
          ],
        },
      ],
    });

    const result = await sitemap();
    const urls = result.map((e) => e.url);

    expect(urls).toContain('https://alma-de-arena.com/producto/kit-basico');
    expect(urls).not.toContain('https://alma-de-arena.com/producto/kit-externo');
  });

  it('restaurante: sin entradas de producto (regresión — sitemap sin cambios)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa({ tipo: 'restaurante' }) });

    const result = await sitemap();
    const urls = result.map((e) => e.url);

    expect(urls.some((u) => u.includes('/producto/'))).toBe(false);
    expect(getCachedMenu).not.toHaveBeenCalled();
  });

  it('host sin empresa asociada: sigue devolviendo [] (sin cambios)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: null });

    expect(await sitemap()).toEqual([]);
  });
});
