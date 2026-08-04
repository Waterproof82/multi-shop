/**
 * Cola de comandos offline para el panel de camarero (cocina / bar / pendientes).
 *
 * PROBLEMA QUE RESUELVE
 * Cuando la red se cae, un PATCH de estado de ítem simplemente se perdía: la UI
 * revertía el cambio y el cocinero tenía que repetirlo. Con el wifi de un
 * restaurante eso ocurre a diario.
 *
 * ── SOLO SE ADMITEN COMANDOS IDEMPOTENTES ───────────────────────────────────
 * Esta es la restricción central del módulo, no un detalle.
 *
 * Reenviar un comando encolado tiene que ser inofensivo si la petición original
 * llegó a impactar el servidor pero la respuesta se perdió — un caso habitual en
 * una red inestable, e indistinguible desde el cliente de "no llegó nunca".
 *
 * Los PATCH de estado de ítem cumplen: fijar `estado = 'servido'` dos veces deja
 * el mismo resultado que hacerlo una. Un `POST /api/pedidos` NO cumple: cada
 * reenvío crea una comanda nueva. Por eso los pedidos no se encolan aquí — sin
 * una clave de idempotencia aceptada por el servidor, reintentar convertiría una
 * comanda perdida en una comanda duplicada, que es un problema peor.
 *
 * ── COLAPSADO POR DESTINO ───────────────────────────────────────────────────
 * Al encolar se reemplaza cualquier comando pendiente con la misma `key`. Esto
 * resuelve dos cosas a la vez:
 *   1. Solo importa el último estado. Si el cocinero marca un ítem
 *      'en_preparacion' y luego 'listo' sin red, reproducir ambos en orden es
 *      innecesario; reproducirlos DESORDENADOS dejaría el ítem en el estado
 *      equivocado.
 *   2. La cola no crece sin límite si alguien insiste sobre el mismo ítem.
 *
 * No toca Realtime: es exclusivamente camino de escritura. Cuando un comando
 * sincroniza, el trigger de base de datos emite su broadcast como siempre.
 */

const DB_NAME = 'waiter_offline';
const STORE = 'commands';
const DB_VERSION = 1;

/** Pasado este margen el comando se descarta: reproducir el estado de un ítem
 *  de hace horas puede contradecir lo que ya pasó en el servicio. */
const MAX_AGE_MS = 60 * 60 * 1000; // 1 h

export interface QueuedCommand {
  /** Destino lógico. Dos comandos con la misma key se colapsan. */
  key: string;
  url: string;
  method: 'PATCH';
  body: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Encola (o reemplaza) un comando idempotente pendiente de envío. */
export async function enqueueCommand(cmd: Omit<QueuedCommand, 'createdAt'>): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      // `put` sobre keyPath 'key' reemplaza el pendiente del mismo destino.
      tx.objectStore(STORE).put({ ...cmd, createdAt: Date.now() } satisfies QueuedCommand);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB no disponible — la cola es una red de seguridad, no una
    // dependencia. Perder el comando aquí deja el sistema como estaba antes.
  }
}

export async function getQueuedCommands(): Promise<QueuedCommand[]> {
  try {
    const db = await openDB();
    return await new Promise<QueuedCommand[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as QueuedCommand[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removeCommand(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

export async function getQueuedCount(): Promise<number> {
  return (await getQueuedCommands()).length;
}

/** Construye la key de un cambio de estado de ítem: un ítem, un comando. */
export function itemStatusKey(pedidoId: string, itemIdx: number): string {
  return `item-status:${pedidoId}:${itemIdx}`;
}

/**
 * Códigos 4xx que SÍ son transitorios y por tanto merecen reintento, pese a
 * caer en el rango de errores de cliente. `/api/pedidos` y las rutas de waiter
 * pasan por rate limit, así que un 429 durante una ráfaga de reenvíos es un
 * escenario esperable, no un rechazo del contenido del comando.
 */
const RETRYABLE_CLIENT_ERRORS = new Set([408, 429]);

/**
 * Decide si un comando se descarta tras la respuesta del servidor.
 *
 * Pura y exportada para poder testear la política sin IndexedDB — es la regla
 * con consecuencias reales:
 *   - 2xx: aplicado, fuera de la cola.
 *   - 4xx: el servidor rechaza el contenido (ítem inexistente, estado inválido,
 *     pedido ya cerrado). Reintentar daría siempre el mismo error, así que se
 *     descarta en lugar de atascar la cola para siempre. Excepto 408 y 429,
 *     que son transitorios.
 *   - 5xx: fallo del servidor, posiblemente transitorio → se conserva.
 */
export function shouldDropAfterResponse(status: number): boolean {
  if (status >= 200 && status < 300) return true;
  if (RETRYABLE_CLIENT_ERRORS.has(status)) return false;
  return status >= 400 && status < 500;
}

/** Un comando demasiado viejo se descarta: reproducir el estado de un ítem de
 *  hace horas puede contradecir lo que ya ocurrió durante el servicio. */
export function isExpired(createdAt: number, now: number = Date.now()): boolean {
  return now - createdAt > MAX_AGE_MS;
}

/**
 * ¿Este evento de ciclo de vida significa que la app VUELVE al primer plano?
 *
 * Importa distinguirlo porque `visibilitychange` se dispara en los dos sentidos.
 * Reaccionar al 'hidden' lanzaría una petición justo cuando el dispositivo se
 * está durmiendo: el peor momento posible, con la radio a punto de apagarse.
 *
 * `pageshow` entra porque cubre la restauración desde bfcache, donde la página
 * se reanuda sin volver a montar y por tanto sin pasar por el flush inicial.
 */
export function isResumeSignal(eventType: string, visibilityState: string): boolean {
  if (eventType === 'pageshow') return true;
  return eventType === 'visibilitychange' && visibilityState === 'visible';
}

/** Guard de reentrada: el flush se dispara desde varios puntos (evento online,
 *  montaje, recuperación de Realtime) y no debe solaparse consigo mismo. */
let flushInFlight: Promise<number> | null = null;

/**
 * Reenvía los comandos pendientes. Devuelve cuántos quedan sin enviar.
 *
 * Secuencial a propósito, no en paralelo: mantiene el orden de llegada y evita
 * una ráfaga de peticiones justo cuando la red acaba de volver, que es
 * exactamente cuando es más frágil.
 */
export async function flushCommandQueue(
  send: (cmd: QueuedCommand) => Promise<Response>,
): Promise<number> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const commands = (await getQueuedCommands()).sort((a, b) => a.createdAt - b.createdAt);
    let pending = 0;

    for (const cmd of commands) {
      if (isExpired(cmd.createdAt)) {
        await removeCommand(cmd.key);
        continue;
      }
      try {
        const res = await send(cmd);
        if (shouldDropAfterResponse(res.status)) {
          await removeCommand(cmd.key);
        } else {
          pending += 1;
        }
      } catch {
        // Fallo de red: el comando sobrevive para el próximo intento.
        pending += 1;
      }
    }
    return pending;
  })().finally(() => { flushInFlight = null; });

  return flushInFlight;
}
