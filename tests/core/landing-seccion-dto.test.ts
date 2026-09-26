import { describe, it, expect } from 'vitest';
import {
  upsertLandingSeccionSchema,
  parseContenidoPorTipo,
} from '@/core/application/dtos/landing-seccion.dto';

describe('upsertLandingSeccionSchema', () => {
  it('acepta el envelope mínimo válido', () => {
    const parsed = upsertLandingSeccionSchema.safeParse({
      activo: true,
      orden: 0,
      contenido: {},
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza activo faltante', () => {
    const parsed = upsertLandingSeccionSchema.safeParse({
      orden: 0,
      contenido: {},
    });
    expect(parsed.success).toBe(false);
  });

  it('orden por defecto es 0 si se omite', () => {
    const parsed = upsertLandingSeccionSchema.safeParse({
      activo: false,
      contenido: {},
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.orden).toBe(0);
  });
});

describe('parseContenidoPorTipo', () => {
  it('hero: acepta kicker/titulo/descripcion/imagenUrl/horario traducibles', () => {
    const result = parseContenidoPorTipo('hero', {
      kicker: { es: 'Tacoronte · Norte de Tenerife' },
      titulo: { es: 'Cocina india auténtica' },
      descripcion: { es: 'Disfrutá de sabores exóticos' },
      imagenUrl: 'https://cdn.example.com/hero.webp',
      horario: { es: 'Todos los días · 13:00–23:00' },
    });
    expect(result.success).toBe(true);
  });

  it('hero: rechaza imagenUrl que no sea string', () => {
    const result = parseContenidoPorTipo('hero', { imagenUrl: 123 });
    expect(result.success).toBe(false);
  });

  it('hero: acepta la cinta en modo imágenes con su lista de imágenes', () => {
    const result = parseContenidoPorTipo('hero', {
      marqueeModo: 'imagenes',
      marqueeImagenes: ['https://cdn.example.com/logo1.webp', 'https://cdn.example.com/logo2.webp'],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.marqueeImagenes).toHaveLength(2);
  });

  it('hero: rechaza un modo de cinta desconocido', () => {
    const result = parseContenidoPorTipo('hero', { marqueeModo: 'video' });
    expect(result.success).toBe(false);
  });

  it('hero: rechaza más de 20 imágenes en la cinta', () => {
    const result = parseContenidoPorTipo('hero', {
      marqueeImagenes: Array.from({ length: 21 }, (_, i) => `https://cdn.example.com/${i}.webp`),
    });
    expect(result.success).toBe(false);
  });

  it('nosotros: acepta kicker/titulo/descripcion/imagenUrl', () => {
    const result = parseContenidoPorTipo('nosotros', {
      titulo: { es: 'Nosotros' },
      descripcion: { es: 'Somos una empresa familiar' },
    });
    expect(result.success).toBe(true);
  });

  it('cta_carta: acepta cta secundaria opcional', () => {
    const result = parseContenidoPorTipo('cta_carta', {
      titulo: { es: 'Más de 200 platos' },
      ctaSecundariaTexto: { es: 'Reservar mesa' },
      ctaSecundariaUrl: 'https://wa.me/34600000000',
    });
    expect(result.success).toBe(true);
  });

  it('testimonio: acepta texto y autor', () => {
    const result = parseContenidoPorTipo('testimonio', {
      texto: { es: 'Un lugar increíble para celebrar' },
      autor: { es: 'Eventos y celebraciones' },
    });
    expect(result.success).toBe(true);
  });

  it('galeria: acepta un array de imagenes, por defecto vacío', () => {
    const result = parseContenidoPorTipo('galeria', {});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagenes).toEqual([]);
  });

  it('galeria: rechaza más de 20 imágenes', () => {
    const result = parseContenidoPorTipo('galeria', {
      imagenes: Array.from({ length: 21 }, (_, i) => `https://cdn.example.com/${i}.webp`),
    });
    expect(result.success).toBe(false);
  });

  it('visitanos: acepta kicker/titulo/horario, sin direccion/telefono (se leen de empresa)', () => {
    const result = parseContenidoPorTipo('visitanos', {
      titulo: { es: 'Dónde estamos' },
      horario: { es: 'Todos los días · 13:00–23:00' },
    });
    expect(result.success).toBe(true);
  });

  it('cualquier tipo: contenido vacío es válido (todos los campos son opcionales)', () => {
    for (const tipo of ['hero', 'nosotros', 'cta_carta', 'testimonio', 'galeria', 'visitanos'] as const) {
      const result = parseContenidoPorTipo(tipo, {});
      expect(result.success, `tipo=${tipo}`).toBe(true);
    }
  });
});
