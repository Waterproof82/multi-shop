/**
 * Cuentas y datos de entrega de la página de seguimiento.
 *
 * Bug real: el total se recalculaba en el navegador como precio × cantidad +
 * tarifa de Glovo, ignorando complementos, los gastos de envío de tienda y el
 * descuento. Un pedido con envío de 4,90 € mostraba 4,90 € menos de lo cobrado.
 * El total que manda es el que guardó el servidor.
 */
import { describe, it, expect } from 'vitest';
import {
  importeItem,
  gastosEnvioCents,
  totalDelPedido,
  estadoPagoVisible,
} from '@/lib/tracking/resumen-pedido';

const TARTA = { nombre: 'Tarta', cantidad: 2, precio: 10, complementos: [{ nombre: 'Nata', precio: 1 }] };

describe('importeItem', () => {
  it('suma los complementos al precio antes de multiplicar', () => {
    expect(importeItem(TARTA)).toBe(22);
  });

  it('sin complementos es precio × cantidad', () => {
    expect(importeItem({ nombre: 'Pan', cantidad: 3, precio: 1.5 })).toBe(4.5);
  });
});

describe('gastosEnvioCents', () => {
  it('tienda: el precio de la modalidad', () => {
    expect(gastosEnvioCents({ modalidad_entrega_precio_cents: 490, delivery_fee_cents: null })).toBe(490);
  });

  it('restaurante: la tarifa de Glovo', () => {
    expect(gastosEnvioCents({ modalidad_entrega_precio_cents: null, delivery_fee_cents: 390 })).toBe(390);
  });

  it('gratis o sin dato: no hay fila de gastos', () => {
    expect(gastosEnvioCents({ modalidad_entrega_precio_cents: 0, delivery_fee_cents: null })).toBeNull();
    expect(gastosEnvioCents({ modalidad_entrega_precio_cents: null, delivery_fee_cents: null })).toBeNull();
  });
});

describe('totalDelPedido', () => {
  it('usa el total guardado por el servidor, con envío y descuento incluidos', () => {
    expect(totalDelPedido({ total: 24.9, items: [TARTA], modalidad_entrega_precio_cents: 490, delivery_fee_cents: null })).toBe(24.9);
  });

  it('sin total guardado (respuesta antigua): recalcula con complementos y envío', () => {
    expect(totalDelPedido({ total: null, items: [TARTA], modalidad_entrega_precio_cents: 490, delivery_fee_cents: null })).toBeCloseTo(26.9);
  });
});

describe('estadoPagoVisible', () => {
  it('pagado online y pago pendiente se muestran', () => {
    expect(estadoPagoVisible('paid')).toBe('pagado');
    expect(estadoPagoVisible('pending')).toBe('pendiente');
  });

  it('sin pago online no se afirma nada', () => {
    expect(estadoPagoVisible('not_required')).toBeNull();
    expect(estadoPagoVisible(null)).toBeNull();
  });
});
