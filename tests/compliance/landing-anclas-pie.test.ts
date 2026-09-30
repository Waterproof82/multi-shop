import { describe, it, expect } from 'vitest';
import { anclasDelPie } from '@/lib/landing/anclas-pie';
import type { LandingSeccion } from '@/core/domain/entities/types';

function seccion(tipo: LandingSeccion['tipo'], contenido: Record<string, unknown> = {}): LandingSeccion {
  return { id: tipo, empresaId: 'e', activo: true, orden: 0, tipo, contenido };
}

describe('anclasDelPie', () => {
  it('devuelve las anclas en el orden de la página', () => {
    expect(anclasDelPie([
      seccion('visitanos'),
      seccion('galeria', { imagenes: ['a.webp'] }),
      seccion('nosotros'),
    ])).toEqual(['donde-estamos', 'galeria', 'nosotros']);
  });

  it('ignora secciones sin ancla (hero, cta, testimonio)', () => {
    expect(anclasDelPie([seccion('hero'), seccion('cta_carta'), seccion('testimonio')])).toEqual([]);
  });

  it('la galería sin fotos válidas no genera ancla (la sección no se pinta)', () => {
    expect(anclasDelPie([seccion('galeria', { imagenes: ['', 3] })])).toEqual([]);
  });

  it('no repite anclas si hay dos secciones del mismo tipo', () => {
    expect(anclasDelPie([seccion('nosotros'), seccion('nosotros')])).toEqual(['nosotros']);
  });
});
