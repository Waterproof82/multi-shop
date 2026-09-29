/**
 * Cuentas de la página de seguimiento. El total que manda es el que guardó el
 * servidor (`pedidos.total`, con envío y descuento ya aplicados); recalcularlo
 * en el navegador ignoraba complementos, gastos de tienda y descuentos.
 */

export interface ItemResumen {
  nombre: string;
  cantidad: number;
  precio: number;
  complementos?: { nombre: string; precio: number }[];
}

interface GastosEnvio {
  modalidad_entrega_precio_cents: number | null;
  delivery_fee_cents: number | null;
}

export function importeItem(item: ItemResumen): number {
  const complementos = (item.complementos ?? []).reduce((sum, c) => sum + Number(c.precio || 0), 0);
  return (item.precio + complementos) * item.cantidad;
}

/** Tienda cobra la modalidad elegida; restaurante, la tarifa de Glovo. */
export function gastosEnvioCents({ modalidad_entrega_precio_cents, delivery_fee_cents }: GastosEnvio): number | null {
  const cents = modalidad_entrega_precio_cents ?? delivery_fee_cents ?? null;
  return cents !== null && cents > 0 ? cents : null;
}

export function totalDelPedido(d: GastosEnvio & { total: number | null; items: ItemResumen[] }): number {
  if (d.total !== null) return d.total;
  const subtotal = d.items.reduce((sum, item) => sum + importeItem(item), 0);
  return subtotal + (gastosEnvioCents(d) ?? 0) / 100;
}

/** Solo se afirma lo que se sabe: sin pago online no se dice nada. */
export function estadoPagoVisible(paymentStatus: string | null): 'pagado' | 'pendiente' | null {
  if (paymentStatus === 'paid') return 'pagado';
  if (paymentStatus === 'pending') return 'pendiente';
  return null;
}
