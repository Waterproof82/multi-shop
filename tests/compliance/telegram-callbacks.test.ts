/**
 * Despacho de los botones de Telegram.
 *
 * POR QUÉ ESTE TEST EXISTE
 * El webhook tenía complejidad 36 en forma de siete `if (match)` encadenados.
 * Al convertirlo en tabla, lo que hay que proteger es el ENRUTADO: qué manejador
 * atiende cada `callback_data`. Un patrón mal escrito no da error — simplemente
 * pulsar "Entregado" hace otra cosa, o nada.
 *
 * Dos propiedades concretas:
 *   1. El ORDEN importa. `modify_reply:` comparte prefijo con `modify:`, así que
 *      si se evaluara primero el corto, el largo no se alcanzaría jamás.
 *   2. Los patrones van ANCLADOS. Sin `^...$`, un `callback_data` manipulado
 *      podría colarse en un manejador que no le toca — y estos manejadores
 *      cambian el estado de pedidos reales.
 */
import { describe, it, expect, vi } from 'vitest';
import { RUTAS_CALLBACK, type Contexto, type ServiciosTelegram } from '../../src/app/api/telegram/webhook/callbacks';

const UUID = '3f2a9c1e-7b04-4d55-9e31-8a6c0f2d4b77';

/** Índice de la ruta que atiende un `callback_data`, o -1 si ninguna. */
function rutaQueAtiende(data: string): number {
  return RUTAS_CALLBACK.findIndex((r) => r.patron.test(data));
}

describe('enrutado por callback_data', () => {
  const casos: Array<[string, string]> = [
    [`modify:${UUID}`, 'modificarTiempo'],
    [`modify_reply:${UUID}`, 'modificarRespuesta'],
    [`eliminar:${UUID}`, 'eliminarMensaje'],
    ['noop', 'sinAccion'],
    [`quick_reply:${UUID}:soon`, 'respuestaRapida'],
    [`quick_reply:${UUID}:call`, 'respuestaRapida'],
    [`entregado:${UUID}:20`, 'marcarEntregado'],
    [`cancelar_entregado:${UUID}:20`, 'cancelarEntregado'],
    [`order:${UUID}:30`, 'fijarTiempo'],
  ];

  it.each(casos)('%s encuentra manejador', (data) => {
    expect(rutaQueAtiende(data)).toBeGreaterThanOrEqual(0);
  });

  it('cada callback lo atiende UNA sola ruta', () => {
    // Si dos patrones solapan, el comportamiento depende del orden de la tabla
    // y deja de ser evidente al leerla.
    for (const [data] of casos) {
      const coincidencias = RUTAS_CALLBACK.filter((r) => r.patron.test(data));
      expect(coincidencias, `"${data}" coincide con ${coincidencias.length} rutas`).toHaveLength(1);
    }
  });

  it('modify_reply se evalúa ANTES que modify', () => {
    const iReply = RUTAS_CALLBACK.findIndex((r) => r.patron.source.includes('modify_reply'));
    const iModify = RUTAS_CALLBACK.findIndex((r) => r.patron.source.includes('^modify:'));

    expect(iReply).toBeGreaterThanOrEqual(0);
    expect(iModify).toBeGreaterThanOrEqual(0);
    expect(iReply).toBeLessThan(iModify);
  });
});

describe('callbacks que NO deben atenderse', () => {
  const rechazables = [
    '',
    'modify:no-es-uuid',
    `modify:${UUID}extra`,
    `prefijo-modify:${UUID}`,
    `order:${UUID}`,
    `order:${UUID}:abc`,
    `quick_reply:${UUID}:otra-cosa`,
    `entregado:${UUID}`,
    'noop-falso',
    `eliminar:${UUID} `,
  ];

  it.each(rechazables)('ignora %j', (data) => {
    expect(rutaQueAtiende(data)).toBe(-1);
  });

  it('todos los patrones están anclados por los dos extremos', () => {
    for (const ruta of RUTAS_CALLBACK) {
      expect(ruta.patron.source.startsWith('^'), `sin ^: ${ruta.patron.source}`).toBe(true);
      expect(ruta.patron.source.endsWith('$'), `sin $: ${ruta.patron.source}`).toBe(true);
    }
  });
});

// ── Comportamiento de los manejadores ────────────────────────────────────────

const repoFalso = {
  findEstimatedReadyAtById: vi.fn(async () => ({ success: true as const, data: null as string | null })),
  findStatusById: vi.fn(async () => ({ success: true as const, data: 'entregado' })),
  updateStatusById: vi.fn(async () => ({ success: true as const, data: undefined })),
  updateEstimatedTime: vi.fn(async () => ({ success: true as const, data: undefined })),
};
vi.mock('@/core/infrastructure/database', () => ({ getPedidoRepository: () => repoFalso }));

function crearContexto(conMensaje = true): { ctx: Contexto; servicios: Record<keyof ServiciosTelegram, ReturnType<typeof vi.fn>> } {
  const servicios = {
    answerCallbackQuery: vi.fn(async () => undefined),
    editMessageText: vi.fn(async () => undefined),
    editMessageReplyMarkup: vi.fn(async () => undefined),
    buildTimeButtons: vi.fn(() => [[{ text: 't', callback_data: 'c' }]]),
    deleteMessage: vi.fn(async () => undefined),
    after: vi.fn(),
  };
  return {
    ctx: {
      callbackQueryId: 'cb-1',
      message: conMensaje ? { message_id: 7, chat: { id: 99 }, text: 'Pedido #3' } : undefined,
      servicios: servicios as unknown as ServiciosTelegram,
    },
    servicios: servicios as never,
  };
}

async function despachar(data: string, conMensaje = true) {
  const { ctx, servicios } = crearContexto(conMensaje);
  const ruta = RUTAS_CALLBACK.find((r) => r.patron.test(data))!;
  await ruta.manejar(ctx, ruta.patron.exec(data)!);
  return servicios;
}

describe('comportamiento de los manejadores', () => {
  it('un callback sin mensaje no revienta ni intenta editar nada', async () => {
    // Telegram omite `message` cuando el original es demasiado viejo. Antes esto
    // se cubría con un `if (message)` repetido en cada rama.
    const servicios = await despachar(`modify:${UUID}`, false);

    expect(servicios.answerCallbackQuery).toHaveBeenCalled();
    expect(servicios.editMessageReplyMarkup).not.toHaveBeenCalled();
  });

  it('modify bloquea el cambio si el pedido ya está listo', async () => {
    repoFalso.findEstimatedReadyAtById.mockResolvedValueOnce({ success: true, data: '2020-01-01T00:00:00Z' });
    const servicios = await despachar(`modify:${UUID}`);

    expect(servicios.answerCallbackQuery).toHaveBeenCalledWith('cb-1', expect.stringContaining('listo'));
    expect(servicios.buildTimeButtons).not.toHaveBeenCalled();
  });

  it('modify ofrece el selector si el pedido aún no está listo', async () => {
    repoFalso.findEstimatedReadyAtById.mockResolvedValueOnce({ success: true, data: null });
    const servicios = await despachar(`modify:${UUID}`);

    expect(servicios.buildTimeButtons).toHaveBeenCalledWith(UUID);
  });

  it('fijarTiempo rechaza valores fuera de rango sin tocar el pedido', async () => {
    repoFalso.updateEstimatedTime.mockClear();
    const servicios = await despachar(`order:${UUID}:999`);

    expect(repoFalso.updateEstimatedTime).not.toHaveBeenCalled();
    expect(servicios.answerCallbackQuery).not.toHaveBeenCalled();
  });

  it('fijarTiempo acepta un valor válido', async () => {
    repoFalso.updateEstimatedTime.mockClear();
    await despachar(`order:${UUID}:30`);

    expect(repoFalso.updateEstimatedTime).toHaveBeenCalledWith(UUID, 30);
  });

  it('entregado programa el borrado en diferido, no en la respuesta', async () => {
    // Hacer esperar a Telegram 5 segundos provocaría reintentos.
    const servicios = await despachar(`entregado:${UUID}:20`);

    expect(servicios.after).toHaveBeenCalledTimes(1);
    expect(servicios.deleteMessage).not.toHaveBeenCalled();
  });
});
