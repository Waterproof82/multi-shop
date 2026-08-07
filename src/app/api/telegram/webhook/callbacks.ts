/**
 * Manejadores de los botones de los mensajes de Telegram.
 *
 * POR QUÉ ES UNA TABLA
 * Antes eran siete bloques `if (match)` encadenados dentro del handler, cada uno
 * repitiendo el mismo `if (message)` y el mismo import dinámico del repositorio.
 * Como tabla, añadir un botón es añadir una fila, y el orden de evaluación —que
 * importa, porque `modify:` y `modify_reply:` comparten prefijo— queda a la
 * vista en lugar de escondido en la secuencia de ifs.
 *
 * Los servicios de Telegram llegan por `ctx.servicios` y no por import directo:
 * así se puede probar el despacho sin hablar con la API de Telegram.
 */
export interface MensajeTelegram {
  message_id: number;
  chat: { id: number };
  text?: string;
}

interface BotonTelegram { text: string; callback_data: string }

export interface ServiciosTelegram {
  answerCallbackQuery: (id: string, texto: string) => Promise<unknown>;
  editMessageText: (chatId: string, messageId: number, texto: string, botones: BotonTelegram[][]) => Promise<unknown>;
  editMessageReplyMarkup: (chatId: string, messageId: number, botones: BotonTelegram[][]) => Promise<unknown>;
  buildTimeButtons: (pedidoId: string) => BotonTelegram[][];
  deleteMessage: (chatId: string, messageId: number) => Promise<unknown>;
  after: (tarea: () => Promise<void>) => void;
}

export interface Contexto {
  callbackQueryId: string;
  message?: MensajeTelegram;
  servicios: ServiciosTelegram;
}

type Manejador = (ctx: Contexto, grupos: RegExpExecArray) => Promise<void>;

/** Los pedidos llegan siempre como UUID en el `callback_data`. */
const UUID = '([0-9a-f-]{36})';

/**
 * Escapa lo que Telegram interpreta como MarkdownV2.
 *
 * Sin esto, un plato llamado `Pan (de ayer)` rompe el formato del mensaje y
 * Telegram rechaza la edición entera.
 */
const escaparMarkdown = (texto: string): string =>
  texto.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');

/** Texto del mensaje sin la línea de respuesta rápida que se le añadió antes. */
const textoSinRespuesta = (texto: string | undefined): string =>
  (texto ?? '').replace(/\n\n[💬📞].+$/s, '');

const RESPUESTAS_RAPIDAS = {
  soon: '💬 Te contestaremos lo más pronto posible',
  call: '📞 Te llamamos ahora en cuanto tengamos un momento',
} as const;

const repo = async () => (await import('@/core/infrastructure/database')).getPedidoRepository();

/**
 * Reemplaza los botones del mensaje, si es que hay mensaje.
 *
 * Telegram puede mandar el callback sin `message` cuando el original es
 * demasiado viejo. Concentrar aquí esa comprobación quita el `if (message)`
 * repetido en los siete manejadores.
 */
async function reemplazarBotones(ctx: Contexto, botones: BotonTelegram[][]): Promise<void> {
  if (!ctx.message) return;
  await ctx.servicios.editMessageReplyMarkup(String(ctx.message.chat.id), ctx.message.message_id, botones);
}

async function reescribirMensaje(ctx: Contexto, texto: string, botones: BotonTelegram[][]): Promise<void> {
  if (!ctx.message) return;
  await ctx.servicios.editMessageText(String(ctx.message.chat.id), ctx.message.message_id, texto, botones);
}

/** Botonera del pedido con tiempo ya fijado. */
const botonesTiempoFijado = (pedidoId: string, minutos: string): BotonTelegram[][] => [
  [{ text: `✅ Tiempo fijado: ${minutos} min`, callback_data: 'noop' }],
  [
    { text: '🔄 Modificar tiempo', callback_data: `modify:${pedidoId}` },
    { text: '✅ Entregado', callback_data: `entregado:${pedidoId}:${minutos}` },
  ],
];

/** Botonera de respuesta rápida para pedidos de tienda. */
const botonesRespuestaRapida = (pedidoId: string): BotonTelegram[][] => [
  [{ text: RESPUESTAS_RAPIDAS.soon, callback_data: `quick_reply:${pedidoId}:soon` }],
  [{ text: RESPUESTAS_RAPIDAS.call, callback_data: `quick_reply:${pedidoId}:call` }],
];

/**
 * "Modificar tiempo" — devuelve el selector de minutos.
 *
 * Se bloquea si el pedido ya pasó su hora estimada: cambiar el tiempo de algo
 * que el cliente ya tiene esperando en el mostrador solo genera confusión.
 */
const modificarTiempo: Manejador = async (ctx, [, pedidoId]) => {
  const listo = await (await repo()).findEstimatedReadyAtById(pedidoId);
  const estimado = listo.success ? listo.data : null;

  if (estimado && new Date(estimado) <= new Date()) {
    await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, '✅ El pedido ya está listo para recoger');
    await reemplazarBotones(ctx, [[{ text: '✅ Pedido listo para recoger', callback_data: 'noop' }]]);
    return;
  }

  await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, 'Selecciona el nuevo tiempo');
  await reemplazarBotones(ctx, ctx.servicios.buildTimeButtons(pedidoId));
};

/** "Modificar respuesta" — restaura las respuestas rápidas de tienda. */
const modificarRespuesta: Manejador = async (ctx, [, pedidoId]) => {
  await (await repo()).updateStatusById(pedidoId, 'pendiente');
  await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, 'Selecciona una respuesta');
  await reescribirMensaje(ctx, escaparMarkdown(textoSinRespuesta(ctx.message?.text)), botonesRespuestaRapida(pedidoId));
};

const eliminarMensaje: Manejador = async (ctx) => {
  await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, '🗑️ Mensaje eliminado');
  if (ctx.message) {
    await ctx.servicios.deleteMessage(String(ctx.message.chat.id), ctx.message.message_id);
  }
};

/** Botón de solo lectura: quita el reloj de carga y no hace nada más. */
const sinAccion: Manejador = async (ctx) => {
  await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, '');
};

const respuestaRapida: Manejador = async (ctx, [, pedidoId, accion]) => {
  const texto = RESPUESTAS_RAPIDAS[accion as keyof typeof RESPUESTAS_RAPIDAS];
  await (await repo()).updateStatusById(pedidoId, accion);
  await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, texto);

  const base = escaparMarkdown(textoSinRespuesta(ctx.message?.text));
  await reescribirMensaje(ctx, `${base}\n\n${escaparMarkdown(texto)}`, [
    [{ text: `✅ ${texto}`, callback_data: 'noop' }],
    [{ text: '🔄 Modificar respuesta', callback_data: `modify_reply:${pedidoId}` }],
  ]);
};

/**
 * "Entregado" — marca el pedido y borra el mensaje a los 5 segundos.
 *
 * El borrado va en `after` para no hacer esperar a Telegram, y comprueba el
 * estado ANTES de borrar: si en esos 5 segundos alguien pulsó "Cancelar", el
 * pedido ya no está entregado y el mensaje debe quedarse.
 */
const marcarEntregado: Manejador = async (ctx, [, pedidoId, minutos]) => {
  await (await repo()).updateStatusById(pedidoId, 'entregado');
  await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, '✅ Pedido entregado — eliminando en 5s');
  if (!ctx.message) return;

  const chatId = String(ctx.message.chat.id);
  const messageId = ctx.message.message_id;

  await ctx.servicios.editMessageReplyMarkup(chatId, messageId, [[
    { text: '✅ Entregado ✓', callback_data: 'noop' },
    { text: '❌ Cancelar (5s)', callback_data: `cancelar_entregado:${pedidoId}:${minutos}` },
  ]]);

  ctx.servicios.after(async () => {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const estado = await (await repo()).findStatusById(pedidoId);
    if (estado.success && estado.data === 'entregado') {
      await ctx.servicios.deleteMessage(chatId, messageId);
    }
  });
};

const cancelarEntregado: Manejador = async (ctx, [, pedidoId, minutos]) => {
  await (await repo()).updateStatusById(pedidoId, 'pendiente');
  await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, '↩️ Eliminación cancelada');
  await reemplazarBotones(ctx, botonesTiempoFijado(pedidoId, minutos));
};

/** Tiempo máximo aceptable, en minutos. Más allá es una pulsación errónea. */
const MAX_MINUTOS = 180;

/** Selección de tiempo estimado desde el selector de minutos. */
const fijarTiempo: Manejador = async (ctx, [, pedidoId, minutosStr]) => {
  const minutos = Number.parseInt(minutosStr, 10);
  if (Number.isNaN(minutos) || minutos <= 0 || minutos > MAX_MINUTOS) return;

  await (await repo()).updateEstimatedTime(pedidoId, minutos);
  await ctx.servicios.answerCallbackQuery(ctx.callbackQueryId, `⏱ Tiempo fijado: ${minutos} minutos`);
  await reemplazarBotones(ctx, botonesTiempoFijado(pedidoId, String(minutos)));
};

/**
 * Tabla de despacho. **El orden importa**: `modify_reply:` tiene que evaluarse
 * antes que `modify:` o el primero nunca se alcanzaría.
 *
 * Los patrones van anclados con `^...$` a propósito: sin el ancla, un
 * `callback_data` manipulado podría hacer coincidir un manejador que no le
 * corresponde.
 */
export const RUTAS_CALLBACK: Array<{ patron: RegExp; manejar: Manejador }> = [
  { patron: new RegExp(`^modify_reply:${UUID}$`), manejar: modificarRespuesta },
  { patron: new RegExp(`^modify:${UUID}$`), manejar: modificarTiempo },
  { patron: new RegExp(`^eliminar:${UUID}$`), manejar: eliminarMensaje },
  { patron: /^noop$/, manejar: sinAccion },
  { patron: new RegExp(`^quick_reply:${UUID}:(soon|call)$`), manejar: respuestaRapida },
  { patron: new RegExp(`^entregado:${UUID}:(\\d+)$`), manejar: marcarEntregado },
  { patron: new RegExp(`^cancelar_entregado:${UUID}:(\\d+)$`), manejar: cancelarEntregado },
  { patron: new RegExp(`^order:${UUID}:(\\d+)$`), manejar: fijarTiempo },
];
