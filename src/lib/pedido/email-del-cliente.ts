/**
 * Reglas de pago y email de un pedido sin mesa. Las usan el carrito y la API:
 * si divergen, el carrito deja enviar lo que la API rechaza, o la API acepta un
 * pedido pagado al que no hay forma de mandarle la confirmación.
 */

export interface ContextoPago {
  esRestaurante: boolean;
  pagosPickupHabilitados: boolean;
  /** Método de entrega del restaurante. En tienda es siempre `null`. */
  origen: 'recogida' | 'delivery' | null;
}

/** El pedido se cobra en Redsys antes de llegar a cocina/almacén. */
export function pasaPorPasarela({ esRestaurante, pagosPickupHabilitados, origen }: ContextoPago): boolean {
  if (origen === 'delivery') return true;
  return pagosPickupHabilitados && (origen === 'recogida' || !esRestaurante);
}

/**
 * Tienda: siempre (confirmación, seguimiento del envío, factura).
 * Restaurante: solo si paga online; si no, es una sugerencia.
 */
export function emailObligatorio(contexto: ContextoPago): boolean {
  if (!contexto.esRestaurante) return true;
  return pasaPorPasarela(contexto);
}
