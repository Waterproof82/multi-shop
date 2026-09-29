/**
 * Mensaje de Telegram de un pedido nuevo.
 *
 * Es lo que lee quien prepara y envía el pedido. Antes solo llevaba cliente,
 * productos y total: sin método de entrega, dirección, gastos de envío ni
 * estado del pago, había que abrir el admin para saber a dónde mandarlo o si
 * ya estaba cobrado. Los botones de tiempo reutilizan este mismo texto
 * (callbacks.ts), así que lo que no esté aquí no está en ningún sitio.
 *
 * Todo dato escrito por el cliente va escapado: MarkdownV2 rechaza el mensaje
 * entero ante un solo carácter reservado sin escapar.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Pedido } from '@/core/domain/entities/types';

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: vi.fn(), logFromCatch: vi.fn() },
}));

const { buildOrderMessage } = await import('@/core/infrastructure/services/telegram.service');

function pedido(over: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1', empresa_id: 'e1', cliente_id: 'c1', numero_pedido: 42,
    detalle_pedido: [{ nombre: 'Tarta', precio: 10, cantidad: 2, complementos: [{ nombre: 'Nata', precio: 1 }] }],
    total: 24.9, moneda: 'EUR', estado: 'pendiente', created_at: '2026-09-29T10:00:00.000Z',
    tracking_token: null, estimated_minutes: null, estimated_ready_at: null,
    clientes: { nombre: 'Ana', email: 'ana@example.com', telefono: '34600123123' },
    ...over,
  };
}

describe('buildOrderMessage — entrega', () => {
  it('tienda a domicilio: modalidad, dirección y gastos de envío', () => {
    const msg = buildOrderMessage(pedido({
      modalidad_entrega_tipo: 'domicilio',
      modalidad_entrega_nombre: 'SEUR 24h',
      modalidad_entrega_precio_cents: 490,
      direccion_entrega: 'Calle Medico Ernesto Castro 57, Puerta 501, 38356 Tacoronte',
    }));
    expect(msg).toContain('*Entrega:* 🛵 Envío a domicilio — SEUR 24h');
    expect(msg).toContain('*Dirección:* Calle Medico Ernesto Castro 57, Puerta 501, 38356 Tacoronte');
    expect(msg).toContain('*Gastos de envío:* 4\\.90 €');
  });

  it('tienda con recogida: sin dirección ni gastos', () => {
    const msg = buildOrderMessage(pedido({ modalidad_entrega_tipo: 'recogida', direccion_entrega: 'no debe salir' }));
    expect(msg).toContain('*Entrega:* 🏬 Recogida en el local');
    expect(msg).not.toContain('Dirección');
    expect(msg).not.toContain('Gastos de envío');
  });

  it('restaurante delivery: dirección y tarifa de Glovo', () => {
    const msg = buildOrderMessage(pedido({ origen: 'delivery', direccion_entrega: 'Calle Mayor 1', delivery_fee_cents: 390 }));
    expect(msg).toContain('*Entrega:* 🛵 Envío a domicilio');
    expect(msg).toContain('*Dirección:* Calle Mayor 1');
    expect(msg).toContain('*Gastos de envío:* 3\\.90 €');
  });

  it('restaurante recogida', () => {
    expect(buildOrderMessage(pedido({ origen: 'recogida' }))).toContain('*Entrega:* 🏬 Recogida en el local');
  });

  it('sin método conocido no inventa uno', () => {
    expect(buildOrderMessage(pedido())).not.toContain('Entrega');
  });
});

describe('buildOrderMessage — pago', () => {
  it('pagado online', () => {
    expect(buildOrderMessage(pedido({ paymentStatus: 'paid' }))).toContain('*Pago:* ✅ Pagado online');
  });

  it('sin pago online', () => {
    expect(buildOrderMessage(pedido({ paymentStatus: 'not_required' }))).toContain('*Pago:* ⏳ Sin pago online');
  });

  it('sin dato de pago no afirma nada', () => {
    expect(buildOrderMessage(pedido())).not.toContain('Pago');
  });
});

describe('buildOrderMessage — lo que ya había', () => {
  it('mantiene cliente, productos con complementos y total', () => {
    const msg = buildOrderMessage(pedido());
    expect(msg).toContain('*Nuevo Pedido: \\#42*');
    expect(msg).toContain('*Cliente:* Ana');
    expect(msg).toContain('2x Tarta');
    expect(msg).toContain('↳ Nata');
    expect(msg).toContain('*Total:* 24\\.90 €');
  });

  it('escapa los caracteres reservados de MarkdownV2 en la dirección y la modalidad', () => {
    const msg = buildOrderMessage(pedido({
      modalidad_entrega_tipo: 'domicilio',
      modalidad_entrega_nombre: 'Envío (24h)',
      direccion_entrega: 'C/ Mayor 1-3, 2º_A. [bis]',
    }));
    expect(msg).toContain('Envío \\(24h\\)');
    expect(msg).toContain('C/ Mayor 1\\-3, 2º\\_A\\. \\[bis\\]');
  });
});
