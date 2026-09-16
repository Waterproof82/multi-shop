// tests/core/attach-modalidad-fields.test.ts
import { describe, it, expect } from 'vitest';
import { attachModalidadFields } from '@/components/cart-drawer';

describe('attachModalidadFields', () => {
  it('no agrega nada si no hay modalidad seleccionada', () => {
    const payload: Record<string, unknown> = {};
    attachModalidadFields(payload, { modalidadEntregaId: null, modalidadEntregaTipo: null, modalidadEntregaPrecioCents: 0, deliveryAddress: '', deliveryPostalCode: '', deliveryLatitude: null, deliveryLongitude: null });
    expect(payload).toEqual({});
  });

  it('agrega los campos de recogida sin dirección', () => {
    const payload: Record<string, unknown> = {};
    attachModalidadFields(payload, { modalidadEntregaId: 'm1', modalidadEntregaTipo: 'recogida', modalidadEntregaPrecioCents: 0, deliveryAddress: '', deliveryPostalCode: '', deliveryLatitude: null, deliveryLongitude: null });
    expect(payload).toEqual({ modalidad_entrega_id: 'm1', modalidad_entrega_tipo: 'recogida', modalidad_entrega_precio_cents: 0 });
  });

  it('agrega dirección solo si el tipo es domicilio', () => {
    const payload: Record<string, unknown> = {};
    attachModalidadFields(payload, {
      modalidadEntregaId: 'm2', modalidadEntregaTipo: 'domicilio', modalidadEntregaPrecioCents: 350,
      deliveryAddress: 'Calle Falsa 123', deliveryPostalCode: '28001', deliveryLatitude: 40.4, deliveryLongitude: -3.7,
    });
    expect(payload).toEqual({
      modalidad_entrega_id: 'm2', modalidad_entrega_tipo: 'domicilio', modalidad_entrega_precio_cents: 350,
      direccion_entrega: 'Calle Falsa 123', codigo_postal: '28001', latitude_entrega: 40.4, longitude_entrega: -3.7,
    });
  });
});
