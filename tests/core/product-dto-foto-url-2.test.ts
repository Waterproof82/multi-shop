import { describe, it, expect } from 'vitest';
import { createProductSchema, updateProductSchema } from '@/core/application/dtos/product.dto';

const base = {
  empresaId: '11111111-1111-1111-8111-111111111111',
  titulo_es: 'Camiseta',
  precio: 19.99,
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
