/**
 * Cuándo es obligatorio el email del cliente en un pedido sin mesa.
 *
 * La regla la comparten el carrito (qué campo marca como obligatorio) y la API
 * (qué rechaza con 400). Si divergen, pasa una de dos cosas: el carrito deja
 * enviar un pedido que la API rechaza, o la API acepta uno sin email al que
 * luego no hay forma de mandar la confirmación del pago.
 *
 *   - Tienda: siempre. Es el canal para la confirmación y el seguimiento.
 *   - Restaurante: solo si el pedido pasa por la pasarela (Redsys).
 */
import { describe, it, expect } from 'vitest';
import { emailObligatorio, pasaPorPasarela, type ContextoPago } from '@/lib/pedido/email-del-cliente';

const TIENDA: ContextoPago = { esRestaurante: false, pagosPickupHabilitados: false, origen: null };
const RESTAURANTE: ContextoPago = { esRestaurante: true, pagosPickupHabilitados: false, origen: null };

describe('pasaPorPasarela', () => {
  it('delivery de restaurante siempre paga online', () => {
    expect(pasaPorPasarela({ ...RESTAURANTE, origen: 'delivery' })).toBe(true);
  });

  it('recogida de restaurante paga online solo con los pagos activados', () => {
    expect(pasaPorPasarela({ ...RESTAURANTE, origen: 'recogida' })).toBe(false);
    expect(pasaPorPasarela({ ...RESTAURANTE, origen: 'recogida', pagosPickupHabilitados: true })).toBe(true);
  });

  it('restaurante sin método elegido no paga online', () => {
    expect(pasaPorPasarela({ ...RESTAURANTE, pagosPickupHabilitados: true })).toBe(false);
  });

  it('tienda paga online solo con los pagos activados, sea recogida o domicilio', () => {
    expect(pasaPorPasarela(TIENDA)).toBe(false);
    expect(pasaPorPasarela({ ...TIENDA, pagosPickupHabilitados: true })).toBe(true);
  });
});

describe('emailObligatorio', () => {
  it('tienda: siempre, aunque no pague online', () => {
    expect(emailObligatorio(TIENDA)).toBe(true);
    expect(emailObligatorio({ ...TIENDA, pagosPickupHabilitados: true })).toBe(true);
  });

  it('restaurante que paga online: obligatorio', () => {
    expect(emailObligatorio({ ...RESTAURANTE, origen: 'delivery' })).toBe(true);
    expect(emailObligatorio({ ...RESTAURANTE, origen: 'recogida', pagosPickupHabilitados: true })).toBe(true);
  });

  it('restaurante que no paga online: opcional', () => {
    expect(emailObligatorio({ ...RESTAURANTE, origen: 'recogida' })).toBe(false);
    expect(emailObligatorio(RESTAURANTE)).toBe(false);
  });
});
