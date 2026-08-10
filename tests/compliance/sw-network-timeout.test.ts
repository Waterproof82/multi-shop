/**
 * Service Worker del panel de camarero — NetworkFirst con timeout.
 *
 * `fetch()` solo rechaza rápido cuando la red está AUSENTE. El caso malo del
 * comedor es otro: WiFi asociado pero sin salida, o 4G al fondo del local. Ahí
 * la petición se cuelga decenas de segundos y, sin timeout, el camarero mira una
 * pantalla en blanco teniendo una copia buena en caché.
 *
 * La carrera tiene cuatro desenlaces y equivocarse en cualquiera se paga:
 *   - red rápida            → servir red (y refrescar caché)
 *   - red lenta CON caché   → servir caché ya, sin esperar
 *   - red lenta SIN caché   → ESPERAR; rendirse aquí convertiría una carga lenta
 *                             en una pantalla de error evitable
 *   - red caída SIN caché   → /waiter/offline, nunca un error del navegador
 *
 * El SW es JS plano que se apoya en globals del worker (self, caches, fetch), así
 * que se evalúa en un vm con esos globals simulados y se conduce el handler a
 * mano. No hay jsdom ni entorno de worker en los tests de node.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';

const SW_SOURCE = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

/** Respuesta mínima con lo que el SW consulta: status, headers.get y clone. */
function makeResponse(body: string, contentType = 'text/html', status = 200) {
  const res = {
    body,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    clone: () => res,
  };
  return res;
}

interface Harness {
  fetchHandler: (event: unknown) => void;
  cache: Map<string, unknown>;
  setFetch: (fn: () => Promise<unknown>) => void;
}

/** Evalúa sw.js con globals simulados y devuelve el handler de `fetch`. */
function loadServiceWorker(): Harness {
  const listeners = new Map<string, (event: unknown) => void>();
  const cache = new Map<string, unknown>();
  let fetchImpl: () => Promise<unknown> = () => Promise.reject(new Error('sin red'));

  const cacheObj = {
    put: (req: { url: string }, res: unknown) => {
      cache.set(req.url, res);
      return Promise.resolve();
    },
    add: () => Promise.resolve(),
  };

  const caches = {
    open: () => Promise.resolve(cacheObj),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
    // Acepta tanto un Request como una string (el fallback usa '/waiter/offline').
    match: (req: { url?: string } | string) => {
      const key = typeof req === 'string' ? req : (req.url ?? '');
      return Promise.resolve(cache.get(key));
    },
  };

  const self = {
    addEventListener: (type: string, cb: (event: unknown) => void) => listeners.set(type, cb),
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve() },
  };

  const sandbox = {
    self,
    globalThis: self,
    caches,
    fetch: (...args: unknown[]) => fetchImpl(...(args as [])),
    setTimeout,
    clearTimeout,
    Promise,
    Symbol,
    URL,
    console,
  };

  runInNewContext(SW_SOURCE, sandbox);

  const fetchHandler = listeners.get('fetch');
  if (!fetchHandler) throw new Error('sw.js no registró un listener de fetch');

  return {
    fetchHandler,
    cache,
    setFetch: (fn) => { fetchImpl = fn; },
  };
}

/** Dispara el handler y devuelve lo que el SW pasó a respondWith(). */
function dispatch(sw: Harness, url: string, method = 'GET'): Promise<unknown> {
  let respuesta: Promise<unknown> | undefined;
  const request = { url, method };
  sw.fetchHandler({ request, respondWith: (p: Promise<unknown>) => { respuesta = p; } });
  return respuesta ?? Promise.resolve(undefined);
}

const WAITER_URL = 'https://tenant.example.com/waiter/kitchen';

describe('SW /waiter — NetworkFirst con timeout de 3 s', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('red rápida: sirve la red y refresca la caché', async () => {
    const sw = loadServiceWorker();
    const fresca = makeResponse('<html>fresca</html>');
    sw.setFetch(() => Promise.resolve(fresca));

    const res = await dispatch(sw, WAITER_URL);

    expect(res).toBe(fresca);
    // La caché queda actualizada para la próxima navegación.
    await vi.waitFor(() => expect(sw.cache.get(WAITER_URL)).toBe(fresca));
  });

  it('red lenta CON caché: sirve la caché sin esperar a la red', async () => {
    vi.useFakeTimers();
    const sw = loadServiceWorker();
    const vieja = makeResponse('<html>cacheada</html>');
    sw.cache.set(WAITER_URL, vieja);

    // Red que no responde nunca: simula el WiFi sin salida.
    sw.setFetch(() => new Promise(() => { /* jamás resuelve */ }));

    const pendiente = dispatch(sw, WAITER_URL);
    await vi.advanceTimersByTimeAsync(3000);

    // Esto es lo que evita la pantalla en blanco.
    expect(await pendiente).toBe(vieja);
    vi.useRealTimers();
  });

  it('red lenta SIN caché: espera a la red en vez de rendirse', async () => {
    vi.useFakeTimers();
    const sw = loadServiceWorker();
    const tardia = makeResponse('<html>tardia</html>');

    // Responde al cuarto segundo: DESPUÉS de que venza el timeout.
    sw.setFetch(() => new Promise((r) => { setTimeout(() => r(tardia), 4000); }));

    const pendiente = dispatch(sw, WAITER_URL);
    await vi.advanceTimersByTimeAsync(5000);

    // Sin copia en caché, servir /waiter/offline a los 3 s convertiría una carga
    // lenta en un error. El SW debe aguantar hasta el desenlace real de la red.
    expect(await pendiente).toBe(tardia);
    vi.useRealTimers();
  });

  it('red caída SIN caché: cae al fallback /waiter/offline', async () => {
    const sw = loadServiceWorker();
    const offline = makeResponse('<html>offline</html>');
    sw.cache.set('/waiter/offline', offline);
    sw.setFetch(() => Promise.reject(new Error('Failed to fetch')));

    expect(await dispatch(sw, WAITER_URL)).toBe(offline);
  });

  it('red caída CON caché: sirve la copia, no el fallback', async () => {
    const sw = loadServiceWorker();
    const vieja = makeResponse('<html>cacheada</html>');
    const offline = makeResponse('<html>offline</html>');
    sw.cache.set(WAITER_URL, vieja);
    sw.cache.set('/waiter/offline', offline);
    sw.setFetch(() => Promise.reject(new Error('Failed to fetch')));

    expect(await dispatch(sw, WAITER_URL)).toBe(vieja);
  });
});

describe('SW — lo que NO debe tocar', () => {
  it('no intercepta /api/*: auth y estados de pedidos nunca se cachean', async () => {
    const sw = loadServiceWorker();
    sw.setFetch(() => Promise.resolve(makeResponse('{}', 'application/json')));

    // respondWith() sin llamar => el request fluye a la red sin pasar por el SW.
    expect(await dispatch(sw, 'https://tenant.example.com/api/waiter/orders/counts')).toBeUndefined();
  });

  it('no intercepta métodos distintos de GET: cache.put lanza con POST', async () => {
    const sw = loadServiceWorker();
    expect(await dispatch(sw, WAITER_URL, 'POST')).toBeUndefined();
  });
});

describe('SW — política de caché por tipo de respuesta', () => {
  it('no cachea un 302: evita fijar un redirect como si fuera la página', async () => {
    const sw = loadServiceWorker();
    sw.setFetch(() => Promise.resolve(makeResponse('', 'text/html', 302)));

    await dispatch(sw, WAITER_URL);
    await new Promise((r) => setTimeout(r, 10));

    expect(sw.cache.has(WAITER_URL)).toBe(false);
  });

  it('cachea el payload RSC: sin él la navegación offline queda en blanco', async () => {
    const sw = loadServiceWorker();
    const rsc = makeResponse('0:["$"]', 'text/x-component');
    sw.setFetch(() => Promise.resolve(rsc));

    await dispatch(sw, WAITER_URL);

    await vi.waitFor(() => expect(sw.cache.get(WAITER_URL)).toBe(rsc));
  });
});
