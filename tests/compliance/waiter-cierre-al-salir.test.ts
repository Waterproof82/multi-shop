/**
 * Que comandas se dan por cerradas cuando el camarero cierra la pestana.
 *
 * Esto vivia dentro del `beforeunload` de `/waiter/bar`, mezclado con los
 * `fetch` que lo ejecutan. Es codigo de resiliencia: lo que se decida mal aqui
 * son bebidas que el sistema da por servidas sin estarlo, o al reves.
 *
 * Se separa la DECISION (que pedidos quedan completos) de la EJECUCION (mandar
 * los PATCH), porque la primera se puede probar y la segunda no: `keepalive`
 * es fuego y olvido, no hay forma de saber si llego.
 *
 * Lo que se congela es el comportamiento QUE YA HABIA, incluidas dos rarezas
 * que parecen erratas y no lo son (ver los tests del final).
 */
import { describe, it, expect } from 'vitest';
import {
  pedidosCompletosAlSalir,
  estadoAlCerrarPedido,
  pedidoDeClave,
  type ItemEnCurso,
} from '@/lib/waiter/cierre-al-salir';

const item = (orderId: string, idx: number, totalInOrder: number): ItemEnCurso =>
  ({ orderId, detallePedidoIdx: idx, totalInOrder });

describe('pedidoDeClave', () => {
  it('separa el pedido del indice', () => {
    expect(pedidoDeClave('ped-1:3')).toBe('ped-1');
  });

  it('corta por el ULTIMO dos puntos, no por el primero', () => {
    // Un id con dos puntos dentro no es teorico: los ids de pedido vienen de la
    // BBDD y nadie promete que no los lleven. Cortar por el primero partiria el
    // id y el pedido no se encontraria nunca.
    expect(pedidoDeClave('ped:raro:2')).toBe('ped:raro');
  });

  it('sin dos puntos devuelve cadena vacia', () => {
    expect(pedidoDeClave('sinindice')).toBe('');
  });
});

describe('estadoAlCerrarPedido', () => {
  it('un pedido solo de bebidas queda servido', () => {
    expect(estadoAlCerrarPedido(false)).toBe('servido');
  });

  it('un pedido con comida vuelve a anotado, no a servido', () => {
    // Si el pedido lleva comida, cocina todavia tiene items suyos que mostrar.
    // Marcarlo 'servido' desde la barra los haria desaparecer de cocina.
    expect(estadoAlCerrarPedido(true)).toBe('anotado');
  });
});

describe('pedidosCompletosAlSalir', () => {
  it('sin nada en vuelo no cierra ningun pedido', () => {
    expect(pedidosCompletosAlSalir([], new Set())).toEqual([]);
  });

  it('cierra el pedido cuando la cuenta atras cubre todos sus items', () => {
    expect(pedidosCompletosAlSalir([item('p1', 0, 1)], new Set())).toEqual(['p1']);
  });

  it('no lo cierra si falta algun item', () => {
    expect(pedidosCompletosAlSalir([item('p1', 0, 3)], new Set())).toEqual([]);
  });

  it('suma los que ya estaban servidos a los que van en vuelo', () => {
    // Dos bebidas: una servida hace rato, la otra con la cuenta atras corriendo.
    expect(pedidosCompletosAlSalir([item('p1', 1, 2)], new Set(['p1:0']))).toEqual(['p1']);
  });

  it('no cuenta como propios los servidos de OTRO pedido', () => {
    expect(pedidosCompletosAlSalir([item('p1', 0, 2)], new Set(['p2:0', 'p2:1']))).toEqual([]);
  });

  it('cierra varios pedidos a la vez', () => {
    const completos = pedidosCompletosAlSalir(
      [item('p1', 0, 1), item('p2', 0, 2)],
      new Set(['p2:1']),
    );
    expect(completos).toHaveLength(2);
    expect(new Set(completos)).toEqual(new Set(['p1', 'p2']));
  });

  it('cierra el pedido con margen: mas cubiertos que items', () => {
    // La condicion original es `>=`, no `===`. Un duplicado entre servidos y
    // pendientes no debe impedir el cierre.
    expect(pedidosCompletosAlSalir([item('p1', 0, 1)], new Set(['p1:0']))).toEqual(['p1']);
  });

  it('no repite un pedido aunque tenga varios items en vuelo', () => {
    expect(pedidosCompletosAlSalir([item('p1', 0, 2), item('p1', 1, 2)], new Set())).toEqual(['p1']);
  });
});

describe('pedidosCompletosAlSalir — comportamientos heredados que NO se corrigen aqui', () => {
  it('un pedido SIN items en vuelo no se cierra, aunque esten todos servidos', () => {
    // Rareza real: la agrupacion se siembra SOLO con los items en cuenta atras,
    // y los servidos unicamente suman a pedidos ya presentes. Si el camarero
    // sirvio todo y despues cierra la pestana sin ninguna cuenta atras
    // corriendo, el PATCH de pedido no sale y el pedido se queda abierto en el
    // servidor.
    //
    // No es un descuido de este refactor: es lo que hacia el `if (e)` del
    // codigo original. Se congela para que se decida a proposito, no por
    // accidente.
    expect(pedidosCompletosAlSalir([], new Set(['p1:0', 'p1:1']))).toEqual([]);
  });

  it('el total lo fija el ULTIMO item en vuelo de ese pedido', () => {
    // El bucle original sobrescribe `total` en cada vuelta con el del item
    // actual. Si dos items del mismo pedido declararan totales distintos
    // —no deberia pasar—, manda el ultimo, no el mayor ni el primero.
    expect(pedidosCompletosAlSalir([item('p1', 0, 9), item('p1', 1, 2)], new Set())).toEqual(['p1']);
  });
});
