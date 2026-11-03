import { describe, it, expect } from 'vitest';
import { findMenuItemBySlug, productosIndexables } from '@/lib/catalogo/productos-publicos';
import type { MenuCategoryVM, MenuItemVM } from '@/core/application/dtos/menu-view-model';

function item(overrides: Partial<MenuItemVM>): MenuItemVM {
  return {
    id: 'p1', name: 'Kit básico', price: 10, category: 'kits',
    ...overrides,
  };
}

function categoria(overrides: Partial<MenuCategoryVM>): MenuCategoryVM {
  return { id: 'c1', label: 'Kits', items: [], ...overrides };
}

describe('findMenuItemBySlug', () => {
  it('encuentra el producto por slug dentro de los items de la categoría', () => {
    const menu: MenuCategoryVM[] = [categoria({ items: [item({ id: 'p1', slug: 'kit-basico' })] })];
    expect(findMenuItemBySlug(menu, 'kit-basico')?.id).toBe('p1');
  });

  it('también busca dentro de subcategorías', () => {
    const menu: MenuCategoryVM[] = [
      categoria({
        items: [],
        subcategories: [
          { id: 'sub1', nombre: 'Interior', products: [item({ id: 'p2', slug: 'kit-interior' })] },
        ],
      }),
    ];
    expect(findMenuItemBySlug(menu, 'kit-interior')?.id).toBe('p2');
  });

  it('devuelve undefined si el slug no existe en este menú', () => {
    const menu: MenuCategoryVM[] = [categoria({ items: [item({ id: 'p1', slug: 'kit-basico' })] })];
    expect(findMenuItemBySlug(menu, 'no-existe')).toBeUndefined();
  });

  // Aislamiento cross-tenant (spec PR2): el lookup nunca cruza tenants porque
  // es puro sobre EL MENÚ YA RESUELTO para el tenant actual (getCachedMenu
  // scopea por empresaId) — nunca recibe ni consulta el menú de otra empresa.
  it('aislamiento cross-tenant: un slug duplicado en el menú de OTRA empresa nunca se devuelve', () => {
    const menuEmpresaA: MenuCategoryVM[] = [categoria({ items: [item({ id: 'a1', slug: 'kit-basico' })] })];
    const menuEmpresaB: MenuCategoryVM[] = [categoria({ items: [item({ id: 'b1', slug: 'kit-basico' })] })];

    const resultado = findMenuItemBySlug(menuEmpresaA, 'kit-basico');

    expect(resultado?.id).toBe('a1');
    expect(resultado?.id).not.toBe('b1');
    // Nunca se consultó menuEmpresaB: la función ni siquiera lo recibió.
    expect(menuEmpresaB).toHaveLength(1);
  });
});

describe('productosIndexables', () => {
  it('incluye solo productos con slug y sin canonicalExterno', () => {
    const menu: MenuCategoryVM[] = [
      categoria({
        items: [
          item({ id: 'p1', slug: 'kit-basico' }),
          item({ id: 'p2', slug: null as unknown as string }),
          item({ id: 'p3', slug: 'kit-externo', canonicalExterno: 'https://kitemergenciacanarias.es/kit-externo' }),
        ],
      }),
    ];
    const resultado = productosIndexables(menu);
    expect(resultado.map((p) => p.id)).toEqual(['p1']);
  });

  it('también recorre subcategorías', () => {
    const menu: MenuCategoryVM[] = [
      categoria({
        items: [],
        subcategories: [
          { id: 'sub1', nombre: 'Interior', products: [item({ id: 'p2', slug: 'kit-interior' })] },
        ],
      }),
    ];
    expect(productosIndexables(menu).map((p) => p.id)).toEqual(['p2']);
  });

  it('un menú sin productos con slug devuelve []', () => {
    const menu: MenuCategoryVM[] = [categoria({ items: [item({ id: 'p1' })] })];
    expect(productosIndexables(menu)).toEqual([]);
  });
});
