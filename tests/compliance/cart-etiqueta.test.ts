import { describe, it, expect } from 'vitest';
import { etiquetaAbrirCarrito, HREF_CARTA_CON_CARRITO } from '@/lib/cart-abrir-param';

// El aria-label sustituye al texto del boton: sin el contador aqui, el
// lector de pantalla nunca oiria cuantos articulos hay en el carrito.
describe('etiquetaAbrirCarrito', () => {
  it('sin articulos, solo la accion', () => {
    expect(etiquetaAbrirCarrito(0, 'es')).toBe('Abrir carrito');
  });

  it('incluye el contador con singular/plural', () => {
    expect(etiquetaAbrirCarrito(1, 'es')).toBe('Abrir carrito, 1 artículo');
    expect(etiquetaAbrirCarrito(3, 'es')).toBe('Abrir carrito, 3 artículos');
  });

  it('el href del FAB apunta a /carta (su canonical) con el parametro de estado', () => {
    expect(HREF_CARTA_CON_CARRITO).toBe('/carta?carrito=abierto');
  });
});
