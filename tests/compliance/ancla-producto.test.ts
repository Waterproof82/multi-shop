import { describe, it, expect } from 'vitest';
import { hrefVolverACarta, slugDesdeHash } from '@/lib/catalogo/ancla-producto';

// "Volver a la carta" desde /producto/[slug] debe dejar al usuario en la card
// que abrió, no arriba del todo. El ancla viaja en el hash (no en la query:
// /carta no debe generar URLs nuevas indexables).
describe('ancla de producto en la carta', () => {
  it('el enlace de volver apunta a la card del producto', () => {
    expect(hrefVolverACarta('bateria-25ah')).toBe('/carta#producto-bateria-25ah');
  });

  it('ida y vuelta: el hash del enlace devuelve el mismo slug', () => {
    const slug = 'café-con-leche';
    const hash = new URL(hrefVolverACarta(slug), 'https://x.test').hash;
    expect(slugDesdeHash(hash)).toBe(slug);
  });

  it('sin slug, vuelve a la carta sin ancla', () => {
    expect(hrefVolverACarta(undefined)).toBe('/carta');
  });

  it.each(['', '#', '#bebidas', '#producto-', 'producto-x'])('ignora hashes que no son de producto: %j', (hash) => {
    expect(slugDesdeHash(hash)).toBeNull();
  });

  it('un hash mal codificado no rompe la carta', () => {
    expect(slugDesdeHash('#producto-%E0%A4%A')).toBeNull();
  });
});
