import { describe, it, expect } from 'vitest';
import { MenuMapper } from '@/core/application/mappers/menu.mapper';
import type { Product, Category } from '@/core/domain/entities/types';

function buildCategory(): Category {
  return {
    id: 'cat-1', empresaId: 'e1', nombre: 'Ropa', descripcion: null, orden: 0,
    tipoProducto: 'comida', categoriaComplementoDe: null, complementoObligatorio: false,
    categoriaPadreId: null, activo: true,
  } as Category;
}

function buildProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p1', empresaId: 'e1', categoriaId: 'cat-1',
    titulo_es: 'Remera', titulo_en: null, titulo_fr: null, titulo_it: null, titulo_de: null,
    descripcion_es: null, descripcion_en: null, descripcion_fr: null, descripcion_it: null, descripcion_de: null,
    precio: 10, fotoUrl: 'https://cdn.example.com/1.webp', fotoUrl2: null, fotoObjectFit: 'cover',
    esEspecial: false, activo: true, tipoProducto: 'comida', createdAt: new Date(),
    alergenos: [], tabla: null,
    ...overrides,
  } as Product;
}

describe('MenuMapper — image2', () => {
  it('mapea fotoUrl2 a image2 cuando existe', () => {
    const vm = MenuMapper.toSubcategoryVM(buildCategory(), [
      buildProduct({ fotoUrl2: 'https://cdn.example.com/2.webp' }),
    ]);
    expect(vm.products[0].image2).toBe('https://cdn.example.com/2.webp');
  });

  it('image2 queda undefined cuando fotoUrl2 es null', () => {
    const vm = MenuMapper.toSubcategoryVM(buildCategory(), [buildProduct({})]);
    expect(vm.products[0].image2).toBeUndefined();
  });
});
