/**
 * Que comandas se dan por cerradas cuando el camarero cierra la pestana de la
 * barra.
 *
 * Vivia dentro del `beforeunload` de `/waiter/bar`, con la decision y los
 * `fetch` entrelazados. Separarlas importa mas aqui que en otros sitios: la
 * ejecucion usa `keepalive`, que es fuego y olvido —no hay respuesta que
 * comprobar, ni reintento—, asi que la unica parte que se puede verificar es
 * esta. Congelado en `tests/compliance/waiter-cierre-al-salir.test.ts`.
 */

/** Item con la cuenta atras corriendo cuando se cierra la pestana. */
export type ItemEnCurso = Readonly<{
  orderId: string;
  detallePedidoIdx: number;
  /** Cuantos items de la barra tiene el pedido al que pertenece. */
  totalInOrder: number;
}>;

/**
 * Pedido al que pertenece una clave `${orderId}:${idx}`.
 *
 * Corta por el ULTIMO `:` a proposito: los ids vienen de la BBDD y nadie
 * promete que no lleven dos puntos dentro.
 *
 * `substring`, NO `slice`: sin `:` el indice es -1, y ahi los dos difieren.
 * `substring` lo trunca a 0 y devuelve cadena vacia —que es lo que hacia el
 * codigo original—; `slice` contaria desde el final y devolveria la clave sin
 * su ultimo caracter, un id inventado que no casaria con ningun pedido.
 */
export function pedidoDeClave(clave: string): string {
  return clave.substring(0, clave.lastIndexOf(':'));
}

/**
 * Estado al que vuelve el pedido cuando la barra termina con el.
 *
 * Con comida vuelve a `anotado`, no a `servido`: cocina todavia tiene items
 * suyos que mostrar, y marcarlo servido desde la barra los haria desaparecer.
 */
export function estadoAlCerrarPedido(tieneComida: boolean): 'anotado' | 'servido' {
  return tieneComida ? 'anotado' : 'servido';
}

/**
 * Pedidos cuyos items quedan todos cubiertos al salir, sumando los que van en
 * cuenta atras y los que ya estaban servidos.
 *
 * **Solo considera pedidos con algun item en curso.** Un pedido enteramente
 * servido, sin ninguna cuenta atras corriendo, NO se cierra — comportamiento
 * heredado, congelado en los tests con su explicacion.
 */
export function pedidosCompletosAlSalir(
  enCurso: readonly ItemEnCurso[],
  clavesServidas: ReadonlySet<string>,
): string[] {
  const porPedido = new Map<string, { cubiertos: number; total: number }>();

  for (const item of enCurso) {
    const previo = porPedido.get(item.orderId);
    porPedido.set(item.orderId, {
      cubiertos: (previo?.cubiertos ?? 0) + 1,
      total: item.totalInOrder,
    });
  }

  for (const clave of clavesServidas) {
    const pedido = porPedido.get(pedidoDeClave(clave));
    if (pedido) pedido.cubiertos += 1;
  }

  const completos: string[] = [];
  for (const [orderId, { cubiertos, total }] of porPedido) {
    if (cubiertos >= total) completos.push(orderId);
  }
  return completos;
}
