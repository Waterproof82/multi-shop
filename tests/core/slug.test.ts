/**
 * slug.ts — domain module (product-detail-pages PR1, tarea 1.1).
 *
 * Pure functions, sin imports de Node ni de Supabase: slugify normaliza un
 * título a slug, siguienteSlugLibre resuelve colisiones con sufijo numérico.
 */
import { describe, it, expect } from 'vitest';
import { slugify, siguienteSlugLibre, SLUG_REGEX, SLUG_MAX } from '@/core/domain/productos/slug';

describe('slugify', () => {
  it('pasa a minúsculas y separa palabras con guiones', () => {
    expect(slugify('Kit Básico de Emergencia')).toBe('kit-basico-de-emergencia');
  });

  it('elimina acentos y diacríticos (NFD)', () => {
    expect(slugify('Ñoño Cañón')).toBe('nono-canon');
  });

  it('colapsa símbolos no alfanuméricos en un solo guión', () => {
    expect(slugify('Kit  24h!! (edición especial)')).toBe('kit-24h-edicion-especial');
  });

  it('recorta guiones al principio y al final', () => {
    expect(slugify('--Kit--')).toBe('kit');
  });

  it('si el resultado queda vacío (solo emojis/símbolos) usa "producto" como fallback', () => {
    expect(slugify('🔥🔥🔥')).toBe('producto');
  });

  it('trunca a SLUG_MAX caracteres sin dejar un guión colgando al final', () => {
    const tituloLargo = 'palabra '.repeat(20); // bastante más de 64 chars
    const resultado = slugify(tituloLargo);
    expect(resultado.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(resultado.endsWith('-')).toBe(false);
  });

  it('el resultado siempre cumple SLUG_REGEX', () => {
    expect(SLUG_REGEX.test(slugify('Kit Básico 72h'))).toBe(true);
  });
});

describe('siguienteSlugLibre', () => {
  it('devuelve el slug base si no está ocupado', () => {
    expect(siguienteSlugLibre('kit-basico', new Set())).toBe('kit-basico');
  });

  it('añade el sufijo -2 si el base ya está ocupado', () => {
    expect(siguienteSlugLibre('kit-basico', new Set(['kit-basico']))).toBe('kit-basico-2');
  });

  it('salta a -3 si -2 también está ocupado', () => {
    const ocupados = new Set(['kit-basico', 'kit-basico-2']);
    expect(siguienteSlugLibre('kit-basico', ocupados)).toBe('kit-basico-3');
  });

  it('trunca el base para que el total con sufijo nunca supere SLUG_MAX', () => {
    const base = 'a'.repeat(SLUG_MAX); // ya al límite, sin espacio para "-2"
    const resultado = siguienteSlugLibre(base, new Set([base]));
    expect(resultado.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(resultado.endsWith('-2')).toBe(true);
  });
});
