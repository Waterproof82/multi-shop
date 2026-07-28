/**
 * E2E — Kitchen & Bar CSRF protection
 *
 * Verifica que TODAS las rutas mutativas de kitchen y bar exigen csrf_token.
 * Cubre la regresión del 2026-07-26: kitchen/page.tsx, waiter/kitchen/page.tsx
 * y waiter/bar/page.tsx enviaban PATCH sin x-csrf-token → 403 en producción.
 *
 * Rutas cubiertas:
 *   PATCH /api/kitchen/items/{id}/{idx}/status          ← bug del 2026-07-26
 *   PATCH /api/waiter/kitchen/items/{id}/{idx}/status   ← bug del 2026-07-26
 *   PATCH /api/waiter/orders/{id}/status                ← bug del 2026-07-26
 *   POST  /api/waiter/kitchen/mesas/{id}/release-retenidos
 *   POST  /api/waiter/mesas/{id}/open
 *   POST  /api/waiter/mesas/{id}/close
 *   POST  /api/waiter/mesas/{id}/dismiss-call
 *   POST  /api/waiter/mesas/{id}/orders/items
 *   POST  /api/waiter/mesas/{id}/manual-payment
 *   POST  /api/waiter/pendientes/validate
 *   GET   /api/kitchen/items           ← debe quedar EXENTO de CSRF
 *   GET   /api/waiter/kitchen/items    ← debe quedar EXENTO de CSRF
 *   GET   /api/waiter/bar/orders       ← debe quedar EXENTO de CSRF
 *   GET   /api/waiter/orders/counts    ← debe quedar EXENTO de CSRF
 *   GET   /api/waiter/mesas            ← debe quedar EXENTO de CSRF
 *
 * Escenarios por ruta mutativa:
 *   A. Sin waiter_token                        → 401 (nunca 403 ni 500) — sin credenciales
 *   B. Con waiter_token, sin x-csrf-token      → 403 CSRF_REQUIRED      — necesita PLAYWRIGHT_WAITER_PIN
 *   C. Con waiter_token, csrf inválido         → 403 CSRF_INVALID        — necesita PLAYWRIGHT_WAITER_PIN
 *
 * Autenticación automática (beforeAll):
 *   1. GET /api/admin/login → csrf_token cookie (endpoint público, sin credenciales)
 *   2. POST /api/waiter/auth con PLAYWRIGHT_WAITER_PIN → waiter_token cookie
 *   Extraemos ambos cookies de Set-Cookie y los usamos para construir las cabeceras de test.
 *
 * Variables de entorno:
 *   PLAYWRIGHT_WAITER_PIN  — PIN numérico del camarero (ej: "1234"). Sin él, B y C se saltan.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

// ── constantes ────────────────────────────────────────────────────────────────

const DUMMY_UUID = '00000000-0000-0000-0000-000000000099';
const DUMMY_IDX  = '0';

// ── sesión de autenticación (compartida por suites B y C) ─────────────────────

/** waiter_token extraído del Set-Cookie de /api/waiter/auth */
let sessionWaiterToken: string | undefined;
/** csrf_token completo (token:sig) extraído del Set-Cookie de /api/admin/login */
let sessionCsrfCookie: string | undefined;
/** solo la parte token (sin :sig), para el header x-csrf-token */
let sessionCsrfToken: string | undefined;

function parseCookieValue(setCookieHeader: string, name: string): string | undefined {
  // Set-Cookie puede contener múltiples cookies separadas por \n en Playwright
  for (const line of setCookieHeader.split('\n')) {
    const match = line.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return undefined;
}

test.beforeAll(async ({ playwright, baseURL }) => {
  const pin = process.env.PLAYWRIGHT_WAITER_PIN;
  if (!pin) return; // Suites B y C se saltan — suite A siempre corre

  const ctx = await playwright.request.newContext({ baseURL });

  // 1. Obtener csrf_token (endpoint público, no requiere auth)
  const csrfRes = await ctx.get('/api/admin/login');
  if (csrfRes.ok()) {
    const csrfSetCookie = csrfRes.headers()['set-cookie'] ?? '';
    sessionCsrfCookie = parseCookieValue(csrfSetCookie, 'csrf_token');
    sessionCsrfToken  = sessionCsrfCookie?.split(':')[0];
  }

  // 2. Login como camarero para obtener waiter_token
  const authRes = await ctx.post('/api/waiter/auth', { data: { pin } });
  if (authRes.ok()) {
    const authSetCookie = authRes.headers()['set-cookie'] ?? '';
    sessionWaiterToken = parseCookieValue(authSetCookie, 'waiter_token');
  }

  await ctx.dispose();
});

// ── rutas mutativas bajo test ─────────────────────────────────────────────────

const PATCH_ROUTES = [
  {
    label: 'PATCH /api/kitchen/items/{id}/{idx}/status',
    url: `/api/kitchen/items/${DUMMY_UUID}/${DUMMY_IDX}/status`,
    body: { estado: 'en_preparacion' },
  },
  {
    label: 'PATCH /api/waiter/kitchen/items/{id}/{idx}/status',
    url: `/api/waiter/kitchen/items/${DUMMY_UUID}/${DUMMY_IDX}/status`,
    body: { estado: 'listo' },
  },
  {
    label: 'PATCH /api/waiter/orders/{id}/status',
    url: `/api/waiter/orders/${DUMMY_UUID}/status`,
    body: { estado: 'anotado' },
  },
];

const POST_ROUTES = [
  {
    label: 'POST /api/waiter/kitchen/mesas/{id}/release-retenidos',
    url: `/api/waiter/kitchen/mesas/${DUMMY_UUID}/release-retenidos`,
    body: {},
  },
  {
    label: 'POST /api/waiter/mesas/{id}/open',
    url: `/api/waiter/mesas/${DUMMY_UUID}/open`,
    body: {},
  },
  {
    label: 'POST /api/waiter/mesas/{id}/close',
    url: `/api/waiter/mesas/${DUMMY_UUID}/close`,
    body: {},
  },
  {
    label: 'POST /api/waiter/mesas/{id}/dismiss-call',
    url: `/api/waiter/mesas/${DUMMY_UUID}/dismiss-call`,
    body: {},
  },
  {
    label: 'POST /api/waiter/mesas/{id}/manual-payment',
    url: `/api/waiter/mesas/${DUMMY_UUID}/manual-payment`,
    body: {},
  },
  {
    label: 'POST /api/waiter/pendientes/validate',
    url: '/api/waiter/pendientes/validate',
    body: {},
  },
  {
    label: 'POST /api/waiter/mesa',
    url: '/api/waiter/mesa',
    body: {},
  },
  {
    label: 'POST /api/waiter/device-token',
    url: '/api/waiter/device-token',
    body: {},
  },
];

const DELETE_ROUTES = [
  {
    label: 'DELETE /api/waiter/mesas/{id}/orders/items',
    url: `/api/waiter/mesas/${DUMMY_UUID}/orders/items`,
    body: { nombre: 'test', precio: 0, cantidadAEliminar: 1 },
  },
];

const GET_EXEMPT_ROUTES = [
  '/api/kitchen/items',
  '/api/waiter/kitchen/items',
  '/api/waiter/bar/orders',
  '/api/waiter/orders/counts',
  '/api/waiter/mesas',
];

// ── Suite A: sin waiter_token → 401 ──────────────────────────────────────────
// Sin variables de entorno. Verifica el auth barrier — nunca 500.

test.describe('Kitchen/Bar — A: sin waiter_token', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const route of PATCH_ROUTES) {
    test(`${route.label} → 401, nunca 403/500`, async () => {
      const res = await request.patch(route.url, { data: route.body });
      expect(res.status()).not.toBe(403);
      expect(res.status()).not.toBe(500);
      expect(res.status()).toBe(401);
    });
  }

  for (const route of POST_ROUTES) {
    test(`${route.label} → 401, nunca 500`, async () => {
      const res = await request.post(route.url, { data: route.body });
      expect(res.status()).not.toBe(500);
      expect([401, 403]).toContain(res.status());
    });
  }

  for (const route of DELETE_ROUTES) {
    test(`${route.label} → 401, nunca 500`, async () => {
      const res = await request.delete(route.url, { data: route.body });
      expect(res.status()).not.toBe(500);
      expect([401, 403]).toContain(res.status());
    });
  }
});

// ── Suite GET: rutas de lectura exentas de CSRF ───────────────────────────────

test.describe('Kitchen/Bar — GET exentas de CSRF', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const url of GET_EXEMPT_ROUTES) {
    test(`GET ${url} → no 403 ni 500`, async () => {
      const res = await request.get(url);
      expect(res.status()).not.toBe(403);
      expect(res.status()).not.toBe(500);
    });
  }
});

// ── Suite B: waiter_token válido, sin csrf_token → 403 CSRF_REQUIRED ─────────
// Activa con PLAYWRIGHT_WAITER_PIN. Verifica que el CSRF check está activo
// en todas las rutas mutativas.

test.describe('Kitchen/Bar — B: waiter_token OK, sin csrf_token', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const route of PATCH_ROUTES) {
    test(`${route.label} → 403 CSRF_REQUIRED`, async () => {
      if (!sessionWaiterToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.patch(route.url, {
        headers: { cookie: `waiter_token=${sessionWaiterToken}` }, // sin csrf_token
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe('AUTH_004');
    });
  }

  for (const route of POST_ROUTES) {
    test(`${route.label} → 403 CSRF_REQUIRED`, async () => {
      if (!sessionWaiterToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.post(route.url, {
        headers: { cookie: `waiter_token=${sessionWaiterToken}` },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe('AUTH_004');
    });
  }

  for (const route of DELETE_ROUTES) {
    test(`${route.label} → 403 CSRF_REQUIRED`, async () => {
      if (!sessionWaiterToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.delete(route.url, {
        headers: { cookie: `waiter_token=${sessionWaiterToken}` },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe('AUTH_004');
    });
  }
});

// ── Suite C: waiter_token válido, csrf_token inválido → 403 CSRF_INVALID ──────
// Activa con PLAYWRIGHT_WAITER_PIN. Verifica que el token CSRF es validado
// criptográficamente — no basta con tener cualquier valor.

test.describe('Kitchen/Bar — C: waiter_token OK, csrf inválido', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const route of PATCH_ROUTES) {
    test(`${route.label} → 403 CSRF_INVALID`, async () => {
      if (!sessionWaiterToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.patch(route.url, {
        headers: {
          cookie: `waiter_token=${sessionWaiterToken}; csrf_token=fakecookie:fakesig`,
          'x-csrf-token': 'fakectoken',
        },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe('AUTH_005');
    });
  }

  for (const route of POST_ROUTES) {
    test(`${route.label} → 403 CSRF_INVALID`, async () => {
      if (!sessionWaiterToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.post(route.url, {
        headers: {
          cookie: `waiter_token=${sessionWaiterToken}; csrf_token=fakecookie:fakesig`,
          'x-csrf-token': 'fakectoken',
        },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe('AUTH_005');
    });
  }

  for (const route of DELETE_ROUTES) {
    test(`${route.label} → 403 CSRF_INVALID`, async () => {
      if (!sessionWaiterToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.delete(route.url, {
        headers: {
          cookie: `waiter_token=${sessionWaiterToken}; csrf_token=fakecookie:fakesig`,
          'x-csrf-token': 'fakectoken',
        },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe('AUTH_005');
    });
  }
});

// ── Suite D: waiter_token válido, csrf correcto → nunca 403 ──────────────────
// Activa con PLAYWRIGHT_WAITER_PIN. Verifica el camino feliz: con auth y CSRF
// correctos, el proxy pasa la request (aunque la ruta devuelva 4xx por datos
// de negocio inválidos, nunca debe ser un error de CSRF).

test.describe('Kitchen/Bar — D: waiter_token OK, csrf correcto', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const route of PATCH_ROUTES) {
    test(`${route.label} → no 403 (CSRF pasa, error de negocio aceptable)`, async () => {
      if (!sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.patch(route.url, {
        headers: {
          cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
          'x-csrf-token': sessionCsrfToken,
        },
        data: route.body,
      });
      // CSRF correcto → nunca 403 por CSRF.
      // Puede ser 4xx (negocio) o 500 (UUID dummy inexistente en DB) — ambos son aceptables aquí.
      expect(res.status()).not.toBe(403);
    });
  }

  for (const route of POST_ROUTES) {
    test(`${route.label} → no 403 (CSRF pasa, error de negocio aceptable)`, async () => {
      if (!sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.post(route.url, {
        headers: {
          cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
          'x-csrf-token': sessionCsrfToken,
        },
        data: route.body,
      });
      // CSRF correcto → nunca 403 por CSRF.
      // Puede ser 4xx o 500 por UUID dummy — lo relevante es que no bloquea CSRF.
      expect(res.status()).not.toBe(403);
    });
  }

  for (const route of DELETE_ROUTES) {
    test(`${route.label} → no 403 (CSRF pasa, error de negocio aceptable)`, async () => {
      if (!sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
        test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o login falló');
        return;
      }
      const res = await request.delete(route.url, {
        headers: {
          cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
          'x-csrf-token': sessionCsrfToken,
        },
        data: route.body,
      });
      expect(res.status()).not.toBe(403);
    });
  }
});
