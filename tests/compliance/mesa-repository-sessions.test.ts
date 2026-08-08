/**
 * `findAllWithSession` — la consulta que pinta el mostrador y el panel de mesas.
 *
 * POR QUÉ ESTE TEST EXISTE
 * Tenía complejidad cognitiva 41 y ninguna prueba, y es de las rutas más
 * calientes del sistema: se re-dispara con cada evento de Realtime y en cada
 * `visibilitychange`. Lo que decide no es trivial —cuántas comandas activas
 * tiene cada mesa, cuáles están listas para servir y qué ítems quedaron
 * retenidos— y todo eso sale de cruzar tres consultas a mano.
 *
 * El cruce tiene dos sutilezas que ninguna consulta expresa por sí sola:
 *   1. Comandas HUÉRFANAS: pedidos con `sesion_id` NULL que sí pertenecen a una
 *      mesa activa. Pasa cuando `open_mesa_sesion` arrastraba una referencia a
 *      una sesión ya cerrada. Si no se rescatan por `mesa_id`, la mesa aparece
 *      vacía teniendo comandas en cocina.
 *   2. El estado EFECTIVO de cada ítem es el de `pedido_item_estados` si existe,
 *      y si no el que hereda del pedido. Confundirlos hace que platos retenidos
 *      se muestren como pendientes, o al revés.
 *
 * Escritas ANTES de refactorizar, contra el código tal cual estaba.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearFakeSupabase, type FakeSupabase } from '../helpers/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: {
    logAndReturnError: vi.fn(async () => undefined),
    logFromCatch: vi.fn(async () => ({ code: 'X', message: 'x', module: 'repository' })),
  },
}));

const { SupabaseMesaRepository } = await import('@/core/infrastructure/database/supabase-mesa.repository');

const EMPRESA = 'e1';

function mesaRpc(extra: Record<string, unknown> = {}) {
  return {
    id: 'mesa-1', empresa_id: EMPRESA, numero: 4, nombre: 'Terraza',
    sesion_id: 'ses-1', sesion_pagada: false, pago_en_curso: false,
    session_total: 42.5, cliente_activo: true, division_activa: false,
    llamada_activa: false, ...extra,
  };
}

function consultar(config: Parameters<typeof crearFakeSupabase>[0]) {
  fake = crearFakeSupabase(config);
  // El repositorio recibe el cliente por constructor.
  return new SupabaseMesaRepository(fake as never).findAllWithSession(EMPRESA);
}

/**
 * Atajo: una sola mesa, sus comandas y los estados de ítem indicados.
 *
 * `pedidos` responde a la primera consulta (por `sesion_id`) y `huerfanos` a la
 * segunda (por `mesa_id`), en ese orden.
 */
function escenario(opts: {
  mesa?: Record<string, unknown>;
  pedidos?: unknown[];
  huerfanos?: unknown[];
  itemEstados?: unknown[];
}) {
  return consultar({
    rpcs: { get_mesas_with_sessions: { data: [mesaRpc(opts.mesa)] } },
    tablas: {
      'pedidos.select': [{ data: opts.pedidos ?? [] }, { data: opts.huerfanos ?? [] }],
      'pedido_item_estados.select': { data: opts.itemEstados ?? [] },
    },
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('errores y casos vacíos', () => {
  it('devuelve error si la RPC falla', async () => {
    const res = await consultar({ rpcs: { get_mesas_with_sessions: { error: { message: 'boom', code: '42' } } } });

    expect(res.success).toBe(false);
    expect(!res.success && res.error.code).toBe('DB_ERROR');
  });

  it('una mesa sin sesión sale con contadores a cero', async () => {
    const res = await consultar({
      rpcs: { get_mesas_with_sessions: { data: [mesaRpc({ sesion_id: null, session_total: 0 })] } },
    });

    expect(res.success && res.data[0]).toMatchObject({
      sesionId: null, activeOrderCount: 0, itemsDiferidos: [], preparadoPedidoNumbers: [],
    });
  });

  it('no consulta pedidos si ninguna mesa tiene sesión abierta', async () => {
    await consultar({ rpcs: { get_mesas_with_sessions: { data: [mesaRpc({ sesion_id: null })] } } });

    expect(fake.llamadas.filter((l) => l.tabla === 'pedidos')).toEqual([]);
  });
});

describe('mapeo de la mesa', () => {
  it('traslada los campos de la RPC al modelo de dominio', async () => {
    const res = await consultar({
      rpcs: { get_mesas_with_sessions: { data: [mesaRpc({ llamada_activa: true, division_activa: true })] } },
      tablas: { 'pedidos.select': { data: [] }, 'pedido_item_estados.select': { data: [] } },
    });

    expect(res.success && res.data[0]).toMatchObject({
      id: 'mesa-1', empresaId: EMPRESA, numero: 4, nombre: 'Terraza',
      sesionId: 'ses-1', sessionTotal: 42.5, clienteActivo: true,
      divisionActiva: true, llamadaActiva: true, sesionPagada: false, pagoEnCurso: false,
    });
  });

  it('convierte el total a número: la RPC lo devuelve como texto', async () => {
    const res = await consultar({
      rpcs: { get_mesas_with_sessions: { data: [mesaRpc({ session_total: '17.80' })] } },
      tablas: { 'pedidos.select': { data: [] }, 'pedido_item_estados.select': { data: [] } },
    });

    expect(res.success && res.data[0].sessionTotal).toBe(17.8);
  });
});

describe('recuento de comandas activas', () => {
  it('cuenta las comandas de la sesión', async () => {
    const res = await escenario({
      pedidos: [
        { id: 'p1', sesion_id: 'ses-1', mesa_id: 'mesa-1', estado: 'pendiente', numero_pedido: 1, detalle_pedido: [] },
        { id: 'p2', sesion_id: 'ses-1', mesa_id: 'mesa-1', estado: 'pendiente', numero_pedido: 2, detalle_pedido: [] },
      ],
    });

    expect(res.success && res.data[0].activeOrderCount).toBe(2);
  });

  it('rescata comandas huérfanas por mesa_id', async () => {
    // Sin este rescate la mesa se vería vacía teniendo comandas en cocina.
    const res = await escenario({
      pedidos: [],
      huerfanos: [
        { id: 'p1', sesion_id: null, mesa_id: 'mesa-1', estado: 'pendiente', numero_pedido: 9, detalle_pedido: [] },
      ],
    });

    expect(res.success && res.data[0].activeOrderCount).toBe(1);
  });

  it('descarta una comanda huérfana cuya mesa no tiene sesión abierta', async () => {
    // No se le puede asignar sesión, así que no puede contarse en ninguna.
    const res = await escenario({
      pedidos: [],
      huerfanos: [
        { id: 'p1', sesion_id: null, mesa_id: 'mesa-desconocida', estado: 'pendiente', numero_pedido: 9, detalle_pedido: [] },
      ],
    });

    expect(res.success && res.data[0].activeOrderCount).toBe(0);
  });
});

describe('comandas listas para servir', () => {
  const pedido = { id: 'p1', sesion_id: 'ses-1', mesa_id: 'mesa-1', estado: 'pendiente', numero_pedido: 7, detalle_pedido: [] };

  it('marca el número de comanda si algún ítem está listo', async () => {
    const res = await escenario({
      pedidos: [pedido],
      itemEstados: [{ pedido_id: 'p1', item_idx: 0, estado: 'listo', from_validation: false }],
    });

    expect(res.success && res.data[0].preparadoPedidoNumbers).toEqual([7]);
  });

  it('cuenta también los ítems que pasaron por la cola de validación', async () => {
    // from_validation=true sigue pudiendo estar 'listo' en cocina; excluirlos
    // dejaría platos terminados sin avisar al camarero.
    const res = await escenario({
      pedidos: [pedido],
      itemEstados: [{ pedido_id: 'p1', item_idx: 0, estado: 'listo', from_validation: true }],
    });

    expect(res.success && res.data[0].preparadoPedidoNumbers).toEqual([7]);
  });

  it('no repite el número de comanda aunque tenga varios ítems listos', async () => {
    const res = await escenario({
      pedidos: [pedido],
      itemEstados: [
        { pedido_id: 'p1', item_idx: 0, estado: 'listo', from_validation: false },
        { pedido_id: 'p1', item_idx: 1, estado: 'listo', from_validation: false },
      ],
    });

    expect(res.success && res.data[0].preparadoPedidoNumbers).toEqual([7]);
  });

  it('no marca nada si ningún ítem está listo', async () => {
    const res = await escenario({
      pedidos: [pedido],
      itemEstados: [{ pedido_id: 'p1', item_idx: 0, estado: 'en_preparacion', from_validation: false }],
    });

    expect(res.success && res.data[0].preparadoPedidoNumbers).toEqual([]);
  });
});

describe('ítems retenidos', () => {
  const conDetalle = (estadoPedido: string, detalle: unknown[], itemEstados: unknown[] = []) =>
    escenario({
      pedidos: [{ id: 'p1', sesion_id: 'ses-1', mesa_id: 'mesa-1', estado: estadoPedido, numero_pedido: 1, detalle_pedido: detalle }],
      itemEstados,
    });

  it('un pedido retenido reporta todos sus ítems como retenidos', async () => {
    const res = await conDetalle('retenido', [{ nombre: 'Vino', precio: 10, cantidad: 2 }]);

    expect(res.success && res.data[0].itemsDiferidos).toEqual([
      expect.objectContaining({ itemName: 'Vino', price: 10, quantity: 2 }),
    ]);
  });

  it('un pedido pendiente no reporta ítems retenidos', async () => {
    const res = await conDetalle('pendiente', [{ nombre: 'Vino', precio: 10, cantidad: 2 }]);

    expect(res.success && res.data[0].itemsDiferidos).toEqual([]);
  });

  it('el estado por ítem MANDA sobre el heredado del pedido', async () => {
    // Pedido retenido, pero un ítem ya liberado a cocina: ese no está retenido.
    const res = await conDetalle(
      'retenido',
      [{ nombre: 'Vino', precio: 10, cantidad: 1 }, { nombre: 'Pan', precio: 2, cantidad: 1 }],
      [{ pedido_id: 'p1', item_idx: 0, estado: 'pendiente', from_validation: true }],
    );

    const nombres = res.success ? res.data[0].itemsDiferidos.map((i) => i.itemName) : [];
    expect(nombres).toEqual(['Pan']);
  });

  it('arrastra complementos y traducciones del ítem', async () => {
    const res = await conDetalle('retenido', [{
      nombre: 'Menú', precio: 12, cantidad: 1,
      complementos: [{ nombre: 'Extra queso', precio: 1.5 }],
      translations: { en: { name: 'Set menu' } },
    }]);

    expect(res.success && res.data[0].itemsDiferidos[0]).toMatchObject({
      selectedComplements: [{ id: 'Extra queso', name: 'Extra queso', price: 1.5 }],
      translations: { en: { name: 'Set menu' } },
    });
  });
});
