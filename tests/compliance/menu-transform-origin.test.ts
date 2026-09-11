import { describe, it, expect } from 'vitest';
import { transformOriginFromClick } from '../../src/lib/menu/transform-origin';

describe('transformOriginFromClick', () => {
  it('da "0px 0px" cuando el click está en el centro exacto del viewport', () => {
    expect(transformOriginFromClick(500, 400, 1000, 800)).toBe('0px 0px');
  });

  it('da coordenadas negativas cuando el click está arriba a la izquierda del centro', () => {
    expect(transformOriginFromClick(100, 50, 1000, 800)).toBe('-400px -350px');
  });

  it('da coordenadas positivas cuando el click está abajo a la derecha del centro', () => {
    expect(transformOriginFromClick(800, 700, 1000, 800)).toBe('300px 300px');
  });
});
