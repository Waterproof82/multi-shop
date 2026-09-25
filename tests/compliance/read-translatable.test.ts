import { describe, it, expect } from 'vitest';
import { readTranslatable } from '@/lib/landing/read-translatable';

describe('readTranslatable', () => {
  it('devuelve el texto en el idioma pedido', () => {
    const contenido = { titulo: { es: 'Hola', en: 'Hello' } };
    expect(readTranslatable(contenido, 'titulo', 'en')).toBe('Hello');
  });

  it('cae a español si falta el idioma pedido', () => {
    const contenido = { titulo: { es: 'Hola' } };
    expect(readTranslatable(contenido, 'titulo', 'fr')).toBe('Hola');
  });

  it('devuelve null si el campo no existe', () => {
    const contenido = {};
    expect(readTranslatable(contenido, 'titulo', 'es')).toBeNull();
  });

  it('devuelve null si el campo existe pero no es un objeto', () => {
    const contenido = { titulo: 'no-deberia-pasar' };
    expect(readTranslatable(contenido, 'titulo', 'es')).toBeNull();
  });

  it('devuelve null si tanto el idioma pedido como es están vacíos', () => {
    const contenido = { titulo: { es: null, en: null } };
    expect(readTranslatable(contenido, 'titulo', 'en')).toBeNull();
  });
});
