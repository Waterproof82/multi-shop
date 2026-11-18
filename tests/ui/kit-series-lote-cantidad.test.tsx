import { describe, it, expect } from 'vitest';
import { cantidadValida } from '@/app/admin/(protected)/kits/lotes/series-lote';

// R-M4.4.1/DD10: N acotado 1-500 — mismo rango que `generarSeriesSchema` en
// Zod. El botón «Generar series» se deshabilita en el cliente con esta misma
// regla, como backstop del 400 del servidor (no el único guardián).
describe('cantidadValida — rango de generación de series', () => {
  it('rechaza 0', () => {
    expect(cantidadValida(0)).toBe(false);
  });

  it('rechaza 501', () => {
    expect(cantidadValida(501)).toBe(false);
  });

  it('acepta 1 (límite inferior)', () => {
    expect(cantidadValida(1)).toBe(true);
  });

  it('acepta 500 (límite superior)', () => {
    expect(cantidadValida(500)).toBe(true);
  });

  it('rechaza un número no entero', () => {
    expect(cantidadValida(1.5)).toBe(false);
  });
});
