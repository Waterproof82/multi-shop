import { describe, it, expect } from 'vitest';
import { subcategoriasConProductos, tieneSubcategoriasConProductos } from '../../src/lib/menu/subcategorias';
import type { MenuCategoryVM, MenuSubcategoryVM } from '../../src/core/application/dtos/menu-view-model';

function subcat(id: string, productCount: number): MenuSubcategoryVM {
  return {
    id,
    nombre: id,
    products: Array.from({ length: productCount }, (_, i) => ({
      id: `${id}-p${i}`,
      name: `producto ${i}`,
      price: 1,
      category: id,
    })),
  };
}

function categoria(subcategories?: MenuSubcategoryVM[]): MenuCategoryVM {
  return { id: 'category-1', label: 'Mermeladas', items: [], subcategories };
}

describe('subcategoriasConProductos', () => {
  it('devuelve vacío si la categoría no tiene subcategorías', () => {
    expect(subcategoriasConProductos(categoria(undefined))).toEqual([]);
  });

  it('filtra las subcategorías sin productos', () => {
    const conProductos = subcat('sub-a', 2);
    const vacia = subcat('sub-b', 0);
    expect(subcategoriasConProductos(categoria([conProductos, vacia]))).toEqual([conProductos]);
  });
});

describe('tieneSubcategoriasConProductos', () => {
  it('es false sin subcategorías', () => {
    expect(tieneSubcategoriasConProductos(categoria(undefined))).toBe(false);
  });

  it('es false si TODAS las subcategorías están vacías', () => {
    expect(tieneSubcategoriasConProductos(categoria([subcat('sub-a', 0), subcat('sub-b', 0)]))).toBe(false);
  });

  it('es true si al menos una subcategoría tiene productos', () => {
    expect(tieneSubcategoriasConProductos(categoria([subcat('sub-a', 0), subcat('sub-b', 1)]))).toBe(true);
  });
});
