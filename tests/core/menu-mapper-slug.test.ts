import { describe, it, expect } from 'vitest';
import { MenuMapper } from '@/core/application/mappers/menu.mapper';
import type { Product, Category } from '@/core/domain/entities/types';

function buildCategory(): Category {
  return {
    id: 'cat-1', empresaId: 'e1', nombre: 'Kits', descripcion: null, orden: 0,
    tipoProducto: 'comida', categoriaComplementoDe: null, complementoObligatorio: false,
    categoriaPadreId: null, activo: true,
  } as Category;
}

function buildProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p1', empresaId: 'e1', categoriaId: 'cat-1',
    titulo_es: 'Kit básico', titulo_en: null, titulo_fr: null, titulo_it: null, titulo_de: null,
    descripcion_es: null, descripcion_en: null, descripcion_fr: null, descripcion_it: null, descripcion_de: null,
    precio: 10, fotoUrl: 'https://cdn.example.com/1.webp', fotoUrl2: null, fotoObjectFit: 'cover',
    esEspecial: false, activo: true, tipoProducto: 'comida', createdAt: new Date(),
    alergenos: [], tabla: null, slug: null, canonicalExterno: null,
    ...overrides,
  } as Product;
}

describe('MenuMapper — slug y canonicalExterno (product-detail-pages PR2)', () => {
  it('mapea slug y canonicalExterno al VM cuando existen', () => {
    const vm = MenuMapper.toSubcategoryVM(buildCategory(), [
      buildProduct({ slug: 'kit-basico', canonicalExterno: 'https://kitemergenciacanarias.es/kit-basico' }),
    ]);
    expect(vm.products[0].slug).toBe('kit-basico');
    expect(vm.products[0].canonicalExterno).toBe('https://kitemergenciacanarias.es/kit-basico');
  });

  it('slug y canonicalExterno quedan undefined cuando son null (producto de restaurante)', () => {
    const vm = MenuMapper.toSubcategoryVM(buildCategory(), [buildProduct({})]);
    expect(vm.products[0].slug).toBeUndefined();
    expect(vm.products[0].canonicalExterno).toBeUndefined();
  });
});
