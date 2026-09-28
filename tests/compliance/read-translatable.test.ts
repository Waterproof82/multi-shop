import { describe, it, expect } from 'vitest';
import { readTranslatable, pickTranslatable } from '@/lib/landing/read-translatable';

// Mismo criterio para la descripción de empresa (hero de la carta), que no
// vive en `contenido` de una sección sino en `empresa.descripcion`.
describe('pickTranslatable', () => {
  it('cae a español si el idioma pedido está vacío', () => {
    expect(pickTranslatable({ es: 'Hola', en: '' }, 'en')).toBe('Hola');
  });

  it('devuelve null sin valor', () => {
    expect(pickTranslatable(null, 'en')).toBeNull();
  });
});

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

  // El editor guarda `{ ...value, [lang]: texto }`: escribir en la pestaña FR y
  // borrarlo deja `fr: ""`. Con `??` ese "" ganaba al español y el visitante
  // francés veía el bloque en blanco (y ni siquiera el título por defecto,
  // porque los `?? t(...)` de las secciones tampoco saltan con "").
  it('cae a español si el idioma pedido es una cadena vacía', () => {
    const contenido = { titulo: { es: 'Hola', fr: '' } };
    expect(readTranslatable(contenido, 'titulo', 'fr')).toBe('Hola');
  });

  it('cae a español si el idioma pedido son solo espacios', () => {
    const contenido = { titulo: { es: 'Hola', de: '   ' } };
    expect(readTranslatable(contenido, 'titulo', 'de')).toBe('Hola');
  });

  it('devuelve null si es también está vacío (para que actúe el texto por defecto)', () => {
    const contenido = { titulo: { es: '', it: '' } };
    expect(readTranslatable(contenido, 'titulo', 'it')).toBeNull();
  });
});
