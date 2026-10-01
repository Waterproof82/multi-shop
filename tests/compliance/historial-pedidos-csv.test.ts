import { describe, it, expect } from 'vitest';
import { celdaCsv, pedidosACsv, type PedidoHistorial } from '@/lib/empresa/historial-csv';

const base: PedidoHistorial = {
  numeroPedido: 12,
  createdAt: '2026-03-05T09:30:00Z',
  estado: 'cerrado',
  origen: 'recogida',
  modalidadEntregaNombre: null,
  total: 21.5,
  totalSinDescuento: null,
  descuentoPorcentaje: null,
  moneda: 'EUR',
  paymentStatus: 'paid',
  detalle: [
    { nombre: 'Batería ES290', precio: 10, cantidad: 2 },
    { nombre: 'Borne', precio: 1.5, cantidad: 1 },
  ],
};

describe('celdaCsv', () => {
  it('entrecomilla y duplica comillas cuando hace falta', () => {
    expect(celdaCsv('simple')).toBe('simple');
    expect(celdaCsv('a;b')).toBe('"a;b"');
    expect(celdaCsv('dice "hola"')).toBe('"dice ""hola"""');
    expect(celdaCsv('dos\nlíneas')).toBe('"dos\nlíneas"');
  });

  it('neutraliza fórmulas: un texto que empieza por = + - @ no se ejecuta al abrirlo en Excel', () => {
    expect(celdaCsv('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(celdaCsv('+34')).toBe("'+34");
    expect(celdaCsv('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(celdaCsv('-1')).toBe("'-1");
  });

  it('los números y vacíos van tal cual', () => {
    expect(celdaCsv(21.5)).toBe('21.5');
    expect(celdaCsv(-3)).toBe('-3');
    expect(celdaCsv(null)).toBe('');
  });
});

describe('pedidosACsv', () => {
  it('cabecera + una fila por pedido, separado por ; y con BOM para que Excel lea las tildes', () => {
    const csv = pedidosACsv([base]);
    const [cabecera, fila] = csv.replace('﻿', '').split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(cabecera).toBe('Nº pedido;Fecha;Estado;Origen;Modalidad de entrega;Total;Total sin descuento;Descuento %;Moneda;Pago;Productos');
    expect(fila).toBe('12;2026-03-05 10:30;cerrado;recogida;;21.5;;;EUR;paid;2x Batería ES290 | 1x Borne');
  });

  it('la fecha va en hora de Madrid (la del ejercicio), no en UTC', () => {
    const csv = pedidosACsv([{ ...base, createdAt: '2026-12-31T23:30:00Z' }]);
    expect(csv).toContain(';2027-01-01 00:30;');
  });

  it('no incluye datos personales del comprador', () => {
    const cabecera = pedidosACsv([]).replace('﻿', '').split('\r\n')[0];
    expect(cabecera).not.toMatch(/direcci|tel[eé]fono|email|nombre del cliente/i);
  });
});
