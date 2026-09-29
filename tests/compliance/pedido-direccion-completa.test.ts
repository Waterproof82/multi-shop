/**
 * Piso, puerta y escalera en la dirección de entrega.
 *
 * Mapbox geocodifica portales (calle + número), no viviendas: "Puerta 501" no
 * existe en su índice. El cliente lo escribe aparte y se incrusta en
 * `direccion_entrega` justo después de calle y número, donde lo lee quien
 * reparte. Va dentro del mismo texto a propósito: así llega sin tocar nada más
 * a Glovo, los emails, el admin y la página de seguimiento.
 */
import { describe, it, expect } from 'vitest';
import { direccionCompleta, DIRECCION_DETALLE_MAX } from '@/lib/pedido/direccion';

const MAPBOX = 'Calle Medico Ernesto Castro 57, 38356 Tacoronte, Santa Cruz de Tenerife, España';

describe('direccionCompleta', () => {
  it('inserta el detalle tras calle y número', () => {
    expect(direccionCompleta(MAPBOX, 'Puerta 501')).toBe(
      'Calle Medico Ernesto Castro 57, Puerta 501, 38356 Tacoronte, Santa Cruz de Tenerife, España',
    );
  });

  it('sin detalle deja la dirección de Mapbox intacta', () => {
    expect(direccionCompleta(MAPBOX, '')).toBe(MAPBOX);
    expect(direccionCompleta(MAPBOX, '   ')).toBe(MAPBOX);
  });

  it('recorta espacios del detalle', () => {
    expect(direccionCompleta(MAPBOX, '  3º B  ')).toContain('57, 3º B, 38356');
  });

  it('dirección sin comas: el detalle va al final', () => {
    expect(direccionCompleta('Calle Mayor 1', '2º A')).toBe('Calle Mayor 1, 2º A');
  });

  it('sin dirección no inventa una', () => {
    expect(direccionCompleta('', 'Puerta 501')).toBe('');
  });

  it('el detalle cabe en el límite de direccion_entrega (500) con cualquier dirección razonable', () => {
    expect(DIRECCION_DETALLE_MAX).toBeLessThanOrEqual(100);
  });
});
