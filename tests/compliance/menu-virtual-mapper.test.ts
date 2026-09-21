/**
 * `toVirtualCategoryVM` arma una MenuCategoryVM a partir de un árbol de
 * menús virtuales + la tabla de asociación, en vez de por `categoriaId`.
 * Ver docs/superpowers/specs/2026-09-16-menus-virtuales-design.md.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: vi.fn(), logFromCatch: vi.fn() },
}));

import { MenuMapper } from '../../src/core/application/mappers/menu.mapper';
import type { MenuVirtual, Product, Category } from '../../src/core/domain/entities/types';

const producto = (id: string, overrides: Partial<Product> = {}): Product => ({
  id,
  empresaId: 'empresa-1',
  categoriaId: 'cat-baterias',
  titulo_es: `Producto ${id}`,
  titulo_en: null,
  titulo_fr: null,
  titulo_it: null,
  titulo_de: null,
  descripcion_es: null,
  descripcion_en: null,
  descripcion_fr: null,
  descripcion_it: null,
  descripcion_de: null,
  precio: 10,
  fotoUrl: null,
  fotoObjectFit: null,
  esEspecial: false,
  activo: true,
  tipoProducto: 'comida',
  createdAt: new Date(),
  alergenos: [],
  ...overrides,
});

const nodo = (id: string, padreId: string | null, nombre = id): MenuVirtual => ({
  id, empresaId: 'empresa-1', padreId, nombre, orden: 0,
});

const categoriaBaterias: Category = {
  id: 'cat-baterias', empresaId: 'empresa-1', nombre: 'Baterías', descripcion: null,
  orden: 0, tipoProducto: 'comida', categoriaComplementoDe: null, complementoObligatorio: false,
  categoriaPadreId: null,
};

describe('MenuMapper.toVirtualCategoryVM', () => {
  it('arma subcategorías con los productos asignados a cada hoja', () => {
    const exide = producto('exide');
    const varta = producto('varta');
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null, 'Vehículos'),
      [nodo('coches', 'vehiculos', 'Coches'), nodo('motos', 'vehiculos', 'Motos')],
      new Map([['coches', ['exide']], ['motos', ['varta']]]),
      new Map([['exide', exide], ['varta', varta]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.subcategories?.find(s => s.id === 'coches')?.products.map(p => p.id)).toEqual(['exide']);
    expect(vm.subcategories?.find(s => s.id === 'motos')?.products.map(p => p.id)).toEqual(['varta']);
  });

  it('items del padre es la unión de todos los hijos (para que el filtro de categorías vacías no lo descarte)', () => {
    const exide = producto('exide');
    const varta = producto('varta');
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos'), nodo('motos', 'vehiculos')],
      new Map([['coches', ['exide']], ['motos', ['varta']]]),
      new Map([['exide', exide], ['varta', varta]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.items.map(i => i.id).sort()).toEqual(['exide', 'varta']);
  });

  it('excluye productos inactivos', () => {
    const activo = producto('activo', { activo: true });
    const inactivo = producto('inactivo', { activo: false });
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos')],
      new Map([['coches', ['activo', 'inactivo']]]),
      new Map([['activo', activo], ['inactivo', inactivo]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.items.map(i => i.id)).toEqual(['activo']);
  });

  it('omite asignaciones huérfanas (producto ya no existe)', () => {
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos')],
      new Map([['coches', ['borrado']]]),
      new Map(), // productosPorId vacío: "borrado" no existe
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.items).toEqual([]);
    expect(vm.subcategories?.[0]?.products).toEqual([]);
  });

  it('subcategoría sin productos asignados queda vacía, no rompe', () => {
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos'), nodo('motos', 'vehiculos')],
      new Map([['coches', ['exide']]]), // "motos" no tiene entrada en el map
      new Map([['exide', producto('exide')]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.subcategories?.find(s => s.id === 'motos')?.products).toEqual([]);
  });

  it('un producto en dos hojas distintas aparece duplicado en items (no se deduplica)', () => {
    const exide = producto('exide');
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos'), nodo('motos', 'vehiculos')],
      new Map([['coches', ['exide']], ['motos', ['exide']]]),
      new Map([['exide', exide]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.items.map(i => i.id)).toEqual(['exide', 'exide']);
  });

  it('propaga complementGroups del producto (sistema nuevo, no depende de categoría)', () => {
    const exide = producto('exide');
    const gruposPorProducto = new Map([['exide', [{ id: 'g1', name: 'Envío', tipo: 'radio' as const, obligatorio: false, opciones: [] }]]]);
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos')],
      new Map([['coches', ['exide']]]),
      new Map([['exide', exide]]),
      new Map([['cat-baterias', categoriaBaterias]]),
      gruposPorProducto,
    );

    expect(vm.subcategories?.[0]?.products[0]?.complementGroups).toEqual(gruposPorProducto.get('exide'));
  });

  it('producto sin complementGroups asignados no rompe (parametro opcional)', () => {
    const exide = producto('exide');
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos')],
      new Map([['coches', ['exide']]]),
      new Map([['exide', exide]]),
      new Map([['cat-baterias', categoriaBaterias]]),
      // sin sexto argumento — debe funcionar igual que antes
    );

    expect(vm.subcategories?.[0]?.products[0]?.complementGroups).toBeUndefined();
  });
});
