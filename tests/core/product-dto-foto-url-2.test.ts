import { describe, it, expect } from 'vitest';
import { createProductSchema, updateProductSchema } from '@/core/application/dtos/product.dto';
import { toAdminProduct } from '@/app/api/admin/productos/route';
import type { Product } from '@/core/domain/entities/types';

const base = {
  empresaId: '11111111-1111-1111-8111-111111111111',
  titulo_es: 'Camiseta',
  precio: 19.99,
};

const baseProduct: Product = {
  id: '33333333-3333-3333-8333-333333333333',
  empresaId: '11111111-1111-1111-8111-111111111111',
  categoriaId: null,
  titulo_es: 'Camiseta',
  titulo_en: null,
  titulo_fr: null,
  titulo_it: null,
  titulo_de: null,
  descripcion_es: null,
  descripcion_en: null,
  descripcion_fr: null,
  descripcion_it: null,
  descripcion_de: null,
  precio: 19.99,
  fotoUrl: 'https://cdn.example.com/foto1.webp',
  fotoUrl2: null,
  fotoObjectFit: null,
  esEspecial: false,
  activo: true,
  tipoProducto: 'comida',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  alergenos: [],
  tabla: null,
};

describe('createProductSchema — foto_url_2', () => {
  it('conserva foto_url_2 en el resultado parseado', () => {
    const parsed = createProductSchema.safeParse({ ...base, foto_url_2: 'https://cdn.example.com/foto2.webp' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.foto_url_2).toBe('https://cdn.example.com/foto2.webp');
    }
  });

  it('conserva foto_url_2 null en el resultado parseado', () => {
    const parsed = createProductSchema.safeParse({ ...base, foto_url_2: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.foto_url_2).toBeNull();
    }
  });

  it('rechaza una URL HTTP (no HTTPS)', () => {
    const parsed = createProductSchema.safeParse({ ...base, foto_url_2: 'http://cdn.example.com/foto2.webp' });
    expect(parsed.success).toBe(false);
  });
});

describe('updateProductSchema — foto_url_2', () => {
  it('permite actualizar solo foto_url_2', () => {
    const parsed = updateProductSchema.safeParse({
      id: '22222222-2222-2222-8222-222222222222',
      foto_url_2: 'https://cdn.example.com/foto2.webp',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.foto_url_2).toBe('https://cdn.example.com/foto2.webp');
    }
  });
});

describe('toAdminProduct — foto_url_2 (regresión GET /api/admin/productos)', () => {
  it('incluye foto_url_2 en la respuesta cuando el producto tiene una segunda foto', () => {
    const producto: Product = { ...baseProduct, fotoUrl2: 'https://cdn.example.com/foto2.webp' };

    const adminProduct = toAdminProduct(producto);

    // Bug real: sin este campo, openEditModal en la UI admin siempre lee
    // foto_url_2 como undefined y precarga el form con '', y al guardar
    // cualquier edición no relacionada, handleSubmit manda foto_url_2: null
    // en el PUT — borrando en silencio la segunda foto ya guardada en DB.
    expect(adminProduct.foto_url_2).toBe('https://cdn.example.com/foto2.webp');
  });

  it('propaga foto_url_2 null cuando el producto no tiene segunda foto', () => {
    const producto: Product = { ...baseProduct, fotoUrl2: null };

    const adminProduct = toAdminProduct(producto);

    expect(adminProduct.foto_url_2).toBeNull();
  });
});
