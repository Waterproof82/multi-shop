import type { PedidoItem } from '@/core/domain/entities/types';

/**
 * Exportación de pedidos de un ejercicio como registro mercantil (art. 30 C.
 * Comercio). Sin datos personales del comprador (dirección, coordenadas): eso
 * es del cliente y tiene su propia vía (`/api/admin/rgpd/exportar-cliente`).
 */
export interface PedidoHistorial {
  readonly numeroPedido: number;
  readonly createdAt: string;
  readonly estado: string;
  readonly origen: string | null;
  readonly modalidadEntregaNombre: string | null;
  readonly total: number;
  readonly totalSinDescuento: number | null;
  readonly descuentoPorcentaje: number | null;
  readonly moneda: string;
  readonly paymentStatus: string | null;
  readonly detalle: readonly Pick<PedidoItem, 'nombre' | 'precio' | 'cantidad'>[];
}

const INICIO_FORMULA = /^[=+\-@\t\r]/;

/**
 * Una celda de CSV. Un texto que empieza por = + - @ se prefija con `'`:
 * Excel lo ejecutaría como fórmula al abrir el fichero (inyección CSV), y los
 * nombres de producto y notas los escribe el tenant o el comprador.
 */
export function celdaCsv(valor: string | number | null): string {
  if (valor === null) return '';
  if (typeof valor === 'number') return String(valor);
  const seguro = INICIO_FORMULA.test(valor) ? `'${valor}` : valor;
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
}

const fechaMadrid = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const CABECERA = [
  'Nº pedido', 'Fecha', 'Estado', 'Origen', 'Modalidad de entrega', 'Total',
  'Total sin descuento', 'Descuento %', 'Moneda', 'Pago', 'Productos',
];

function fila(p: PedidoHistorial): string {
  const productos = p.detalle.map((i) => `${i.cantidad}x ${i.nombre}`).join(' | ');
  return [
    p.numeroPedido,
    fechaMadrid.format(new Date(p.createdAt)),
    p.estado,
    p.origen,
    p.modalidadEntregaNombre,
    p.total,
    p.totalSinDescuento,
    p.descuentoPorcentaje,
    p.moneda,
    p.paymentStatus,
    productos,
  ].map(celdaCsv).join(';');
}

/** `;` como separador y BOM UTF-8: es lo que Excel en español abre bien a la primera. */
export function pedidosACsv(pedidos: readonly PedidoHistorial[]): string {
  return '﻿' + [CABECERA.join(';'), ...pedidos.map(fila)].join('\r\n');
}
