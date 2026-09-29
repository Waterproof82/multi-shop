/**
 * Qué datos del pedido salen a la página pública de seguimiento.
 *
 * La API (`/api/orders/status`) y el render del servidor (`tracking/[token]`)
 * construían la respuesta por separado: la API filtraba campos, pero la página
 * pasaba el objeto entero del repositorio al componente de cliente, así que
 * `telegram_chat_id` y `telegram_message_id` acababan en el HTML público.
 * Ahora las dos usan esta función.
 */
import { describe, it, expect } from 'vitest';
import { vistaPublicaSeguimiento, type PedidoSeguimiento } from '@/lib/tracking/vista-publica';

const PEDIDO: PedidoSeguimiento = {
  id: 'uuid-interno',
  numero_pedido: 42,
  estimated_minutes: null,
  estimated_ready_at: null,
  telegram_message_id: '999',
  telegram_chat_id: '-100123',
  tipo: 'tienda',
  estado: 'pendiente',
  glovo_status: null,
  mesa_id: null,
  mesa_numero: null,
  mesa_nombre: null,
  delivery_fee_cents: null,
  payment_status: 'paid',
  sesion_id: null,
  google_reviews_url: null,
  total: 24.9,
  modalidad_entrega_tipo: 'domicilio',
  modalidad_entrega_nombre: 'SEUR 24h',
  modalidad_entrega_precio_cents: 490,
  direccion_entrega: 'Calle Mayor 1, Puerta 501',
  origen: null,
  numero_seguimiento: 'ES123',
  descuento_porcentaje: 10,
  items: [{ nombre: 'Tarta', cantidad: 1, precio: 20 }],
};

describe('vistaPublicaSeguimiento', () => {
  it('NO expone datos internos de Telegram ni el id del pedido', () => {
    const vista = vistaPublicaSeguimiento(PEDIDO) as Record<string, unknown>;
    expect(vista).not.toHaveProperty('telegram_chat_id');
    expect(vista).not.toHaveProperty('telegram_message_id');
    expect(vista).not.toHaveProperty('id');
  });

  it('incluye entrega, dirección, pago, total real, descuento y número de seguimiento', () => {
    expect(vistaPublicaSeguimiento(PEDIDO)).toMatchObject({
      numero_pedido: 42,
      total: 24.9,
      payment_status: 'paid',
      modalidad_entrega_tipo: 'domicilio',
      modalidad_entrega_nombre: 'SEUR 24h',
      modalidad_entrega_precio_cents: 490,
      direccion_entrega: 'Calle Mayor 1, Puerta 501',
      numero_seguimiento: 'ES123',
      descuento_porcentaje: 10,
    });
  });

  it('en recogida no expone una dirección residual', () => {
    const vista = vistaPublicaSeguimiento({ ...PEDIDO, modalidad_entrega_tipo: 'recogida', direccion_entrega: 'residuo' });
    expect(vista.direccion_entrega).toBeNull();
  });
});
