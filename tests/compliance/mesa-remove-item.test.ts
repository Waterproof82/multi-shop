/**
 * Borrado de ítems de una cuenta de mesa abierta.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `removeSessionItemUseCase` tenía complejidad cognitiva 38 y ninguna prueba.
 * Es el caso de uso que ejecuta el camarero cuando un comensal se arrepiende de
 * un plato, y toca tres cosas a la vez: cuántas unidades se quitan, cuánto pasa
 * a valer la cuenta, y —lo más delicado— la reindexación de `mesa_item_pagos`.
 *
 * Esa reindexación es la que puede hacer daño de verdad. Los pagos por ítem se
 * referencian por POSICIÓN dentro de `detalle_pedido`. Si se borra un ítem del
 * medio, todas las posiciones posteriores se desplazan: sin corregirlas, el
 * pago que apuntaba al vino pasa a apuntar al postre. Nadie lo nota en el
 * momento; se nota al dividir la cuenta.
 *
 * Escritas ANTES de refactorizar, contra el código tal cual estaba.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearFakeSupabase, llamadasDe, type FakeSupabase } from '../helpers/fake-supabase';

let fake: FakeSupabase;
let pedidosDeSesion: { id: string; total: number; detalle_pedido: unknown[] }[] = [];
/** Forma de un ítem tal y como lo reescribe el caso de uso. */
type ItemReescrito = { nombre: string; cantidad: number; precio: number };

// El espía declara la firma REAL de `updateOrderItems`. Con `vi.fn(async () => …)`
// —sin parámetros— `mock.calls` queda tipado como tupla vacía y leer `[1]` o `[2]`
// es un error de tipos que solo se veía silenciado porque `tests/` no entraba en
// el typecheck.
const updateOrderItemsSpy = vi.fn(
  async (_pedidoId: string, _items: ItemReescrito[], _total: number) => ({
    success: true as const,
    data: undefined,
  }),
);

vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: () => fake,
}));
vi.mock('@/core/infrastructure/database', () => ({
  getPedidoRepository: () => ({
    findBySesionId: async () => ({ success: true as const, data: pedidosDeSesion }),
    updateOrderItems: (pedidoId: string, items: ItemReescrito[], total: number) =>
      updateOrderItemsSpy(pedidoId, items, total),
  }),
}));
vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logFromCatch: vi.fn(async () => ({ code: 'X', message: 'x', module: 'use-case' })) },
}));

const { removeSessionItemUseCase } = await import(
  '@/core/application/use-cases/mesa/removeSessionItemUseCase'
);

const SESION = 's1';
const EMPRESA = 'e1';

function quitar(nombre: string, precio: number, cantidad: number) {
  return removeSessionItemUseCase({
    sesionId: SESION, empresaId: EMPRESA, nombre, precio, cantidadAEliminar: cantidad,
  });
}

/** Argumentos con los que se reescribió un pedido. Ya no hacen falta casts. */
function itemsReescritos(llamada = 0): ItemReescrito[] | undefined {
  return updateOrderItemsSpy.mock.calls[llamada]?.[1];
}
function totalReescrito(llamada = 0): number | undefined {
  return updateOrderItemsSpy.mock.calls[llamada]?.[2];
}

beforeEach(() => {
  updateOrderItemsSpy.mockClear();
  fake = crearFakeSupabase();
  pedidosDeSesion = [];
});

describe('cuántas unidades se quitan', () => {
  it('descuenta parcialmente cuando el ítem tiene más unidades de las pedidas', async () => {
    pedidosDeSesion = [{ id: 'p1', total: 30, detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 3 }] }];

    const res = await quitar('Vino', 10, 1);

    expect(res.success && res.data.totalRemoved).toBe(1);
    expect(itemsReescritos()).toEqual([{ nombre: 'Vino', precio: 10, cantidad: 2 }]);
  });

  it('reparte el borrado entre varios pedidos de la misma sesión', async () => {
    pedidosDeSesion = [
      { id: 'p1', total: 20, detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 2 }] },
      { id: 'p2', total: 20, detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 2 }] },
    ];

    const res = await quitar('Vino', 10, 3);

    expect(res.success && res.data.totalRemoved).toBe(3);
    // p1 se vacía entero (updateOrderItems con []), p2 baja de 2 a 1 unidad.
    expect(updateOrderItemsSpy).toHaveBeenCalledTimes(2);
    expect(itemsReescritos(0)).toEqual([]);
    expect(itemsReescritos(1)).toEqual([{ nombre: 'Vino', precio: 10, cantidad: 1 }]);
  });

  it('nunca quita más unidades de las que existen', async () => {
    pedidosDeSesion = [{ id: 'p1', total: 10, detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 1 }] }];

    const res = await quitar('Vino', 10, 99);

    expect(res.success && res.data.totalRemoved).toBe(1);
  });

  it('no toca nada si no hay ningún ítem que coincida', async () => {
    pedidosDeSesion = [{ id: 'p1', total: 10, detalle_pedido: [{ nombre: 'Agua', precio: 2, cantidad: 1 }] }];

    const res = await quitar('Vino', 10, 1);

    expect(res.success && res.data.totalRemoved).toBe(0);
    expect(updateOrderItemsSpy).not.toHaveBeenCalled();
    expect(fake.llamadas).toEqual([]);
  });

  it('distingue por nombre Y precio: el mismo plato a otro precio no cuenta', async () => {
    // Pasa de verdad: cambia la carta a media jornada y conviven dos precios.
    pedidosDeSesion = [{
      id: 'p1', total: 18,
      detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 1 }, { nombre: 'Vino', precio: 8, cantidad: 1 }],
    }];

    const res = await quitar('Vino', 8, 5);

    expect(res.success && res.data.totalRemoved).toBe(1);
    expect(itemsReescritos()).toEqual([{ nombre: 'Vino', precio: 10, cantidad: 1 }]);
  });

  it('tolera el error de coma flotante al comparar precios', async () => {
    // 0.1 + 0.2 no es 0.3. La comparación es por tolerancia, no por igualdad.
    pedidosDeSesion = [{ id: 'p1', total: 1, detalle_pedido: [{ nombre: 'Café', precio: 0.1 + 0.2, cantidad: 1 }] }];

    const res = await quitar('Café', 0.3, 1);

    expect(res.success && res.data.totalRemoved).toBe(1);
  });
});

describe('el pedido que se queda sin ítems se vacía, nunca se borra', () => {
  // `pedidos_no_delete` (Art.66 LGT) bloquea el DELETE real de una fila que
  // no sea `es_prueba`: un DELETE de verdad aquí fallaría en producción.
  it('reescribe detalle_pedido a vacío y total a 0 en vez de borrar la fila', async () => {
    pedidosDeSesion = [{ id: 'p1', total: 10, detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 1 }] }];

    const res = await quitar('Vino', 10, 1);

    expect(res.success && res.data.totalRemoved).toBe(1);
    expect(itemsReescritos()).toEqual([]);
    expect(totalReescrito()).toBe(0);
  });

  it('marca el pedido como cancelado y limpia pagos y estados por ítem', async () => {
    pedidosDeSesion = [{ id: 'p1', total: 10, detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 1 }] }];

    await quitar('Vino', 10, 1);

    const cancelado = llamadasDe(fake, 'pedidos').find((l) => l.operacion === 'update');
    expect((cancelado?.payload as Record<string, unknown>)?.['estado']).toBe('cancelado');

    const borrados = fake.llamadas.filter((l) => l.operacion === 'delete').map((l) => l.tabla);
    expect(borrados).toEqual(['mesa_item_pagos', 'pedido_item_estados']);
    expect(fake.llamadas.some((l) => l.tabla === 'pedidos' && l.operacion === 'delete')).toBe(false);
  });
});

describe('recálculo del total', () => {
  it('suma los complementos de cada ítem, no solo el precio base', async () => {
    pedidosDeSesion = [{
      id: 'p1', total: 30,
      detalle_pedido: [
        { nombre: 'Vino', precio: 10, cantidad: 1 },
        { nombre: 'Menú', precio: 8, cantidad: 2, complementos: [{ precio: 1 }, { precio: 0.5 }] },
      ],
    }];

    await quitar('Vino', 10, 1);

    // (8 + 1 + 0.5) * 2 = 19
    expect(totalReescrito()).toBeCloseTo(19, 5);
  });

  it('trata un ítem sin complementos como si tuviera cero', async () => {
    pedidosDeSesion = [{
      id: 'p1', total: 30,
      detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 1 }, { nombre: 'Agua', precio: 2, cantidad: 3 }],
    }];

    await quitar('Vino', 10, 1);

    expect(totalReescrito()).toBeCloseTo(6, 5);
  });
});

describe('reindexado de mesa_item_pagos', () => {
  it('borra los pagos de los ítems que desaparecen', async () => {
    pedidosDeSesion = [{
      id: 'p1', total: 20,
      detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 1 }, { nombre: 'Agua', precio: 2, cantidad: 1 }],
    }];

    await quitar('Vino', 10, 1);

    const borrado = llamadasDe(fake, 'mesa_item_pagos').find((l) => l.operacion === 'delete');
    expect(borrado?.filtros['item_idx']).toEqual([0]);
  });

  it('reasigna las posiciones que se desplazan', async () => {
    // Se va el ítem 0, así que el 1 pasa a ser 0 y el 2 pasa a ser 1. Sin esto,
    // el pago del agua acabaría apuntando al vino.
    pedidosDeSesion = [{
      id: 'p1', total: 20,
      detalle_pedido: [
        { nombre: 'Vino', precio: 10, cantidad: 1 },
        { nombre: 'Agua', precio: 2, cantidad: 1 },
        { nombre: 'Pan', precio: 1, cantidad: 1 },
      ],
    }];

    await quitar('Vino', 10, 1);

    const updates = llamadasDe(fake, 'mesa_item_pagos')
      .filter((l) => l.operacion === 'update')
      .map((l) => ({ de: l.filtros['item_idx'], a: (l.payload as Record<string, unknown>)['item_idx'] }));

    // Descendente por índice viejo: si se hiciera al revés, el 1→0 chocaría con
    // una fila que aún ocupa el 0 antes de que esta se mueva.
    expect(updates).toEqual([{ de: 2, a: 1 }, { de: 1, a: 0 }]);
  });

  it('no reasigna nada si solo baja la cantidad de un ítem', async () => {
    pedidosDeSesion = [{ id: 'p1', total: 30, detalle_pedido: [{ nombre: 'Vino', precio: 10, cantidad: 3 }] }];

    await quitar('Vino', 10, 1);

    expect(llamadasDe(fake, 'mesa_item_pagos').filter((l) => l.operacion === 'update')).toEqual([]);
  });
});

describe('cierre automático de la cuenta dividida a la carta', () => {
  const conSesion = (division: string | null, pagada: boolean, totalPedidos: number, pagadoCents: number) => {
    pedidosDeSesion = [{ id: 'p1', total: 30, detalle_pedido: [
      { nombre: 'Vino', precio: 10, cantidad: 1 }, { nombre: 'Agua', precio: 2, cantidad: 1 },
    ] }];
    fake = crearFakeSupabase({
      tablas: {
        'mesa_sesiones.select': { data: { division_tipo: division, sesion_pagada: pagada } },
        'pedidos.select': { data: [{ total: totalPedidos }] },
        'mesa_pagos_personalizados.select': { data: [{ importe_cents: pagadoCents }] },
      },
    });
  };

  it('cierra la cuenta cuando lo ya pagado cubre el nuevo total', async () => {
    // El caso real: el camarero quita el último plato sin pagar y lo que ya
    // habían puesto los comensales pasa a cubrirlo todo.
    conSesion('personalizado', false, 2, 500);
    await quitar('Vino', 10, 1);

    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
    )).toBe(true);
  });

  it('no cierra la cuenta si lo pagado aún no llega', async () => {
    conSesion('personalizado', false, 50, 500);
    await quitar('Vino', 10, 1);

    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
    )).toBe(false);
  });

  it('no se aplica a cuentas que no son personalizadas', async () => {
    conSesion('partes_iguales', false, 2, 500);
    await quitar('Vino', 10, 1);

    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
    )).toBe(false);
  });

  it('no vuelve a cerrar una sesión ya pagada', async () => {
    conSesion('personalizado', true, 2, 500);
    await quitar('Vino', 10, 1);

    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
    )).toBe(false);
  });

  it('ni siquiera consulta la sesión si no se quitó nada', async () => {
    pedidosDeSesion = [{ id: 'p1', total: 10, detalle_pedido: [{ nombre: 'Agua', precio: 2, cantidad: 1 }] }];
    fake = crearFakeSupabase();

    await quitar('Vino', 10, 1);

    expect(llamadasDe(fake, 'mesa_sesiones')).toEqual([]);
  });
});
