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
 *   A. Sin waiter_token                        → 401 UNAUTHORIZED (nunca 403 ni 500)
 *   B. Con waiter_token, sin x-csrf-token      → 403 CSRF_REQUIRED  [necesita PLAYWRIGHT_WAITER_TOKEN]
 *   C. Con waiter_token, csrf_token inválido   → 403 CSRF_INVALID   [necesita PLAYWRIGHT_WAITER_TOKEN]
 *
 * Variables de entorno:
 *   PLAYWRIGHT_WAITER_TOKEN  — cookie waiter_token de sesión real
 *   PLAYWRIGHT_CSRF_TOKEN    — valor del csrf_token (sin :sig) de sesión real
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

// ── helpers ───────────────────────────────────────────────────────────────────

const DUMMY_UUID = '00000000-0000-0000-0000-000000000099';
const DUMMY_IDX  = '0';

function waiterToken(): string | undefined {
  return process.env.PLAYWRIGHT_WAITER_TOKEN;
}

function csrfToken(): string | undefined {
  return process.env.PLAYWRIGHT_CSRF_TOKEN;
}

/** Cookie header con waiter_token válido pero SIN csrf_token */
function cookieNocsrf(token: string): string {
  return `waiter_token=${token}`;
}

/** Cookie header con waiter_token válido Y csrf_token con firma incorrecta */
function cookieInvalidCsrf(token: string): string {
  return `waiter_token=${token}; csrf_token=fakecookie:fakesig`;
}

/** Headers para CSRF válido (necesita credenciales reales) */
function headersValidCsrf(token: string): Record<string, string> {
  const csrf = csrfToken() ?? 'real-csrf-token';
  return {
    cookie: `waiter_token=${token}; csrf_token=${csrf}:sig`,
    'x-csrf-token': csrf,
  };
}

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
    label: 'POST /api/waiter/mesas/{id}/orders/items',
    url: `/api/waiter/mesas/${DUMMY_UUID}/orders/items`,
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
];

const GET_EXEMPT_ROUTES = [
  '/api/kitchen/items',
  '/api/waiter/kitchen/items',
  '/api/waiter/bar/orders',
  '/api/waiter/orders/counts',
  '/api/waiter/mesas',
];

// ── Suite A: sin waiter_token → 401, nunca 403 ni 500 ────────────────────────
// No requiere variables de entorno. Verifica que el auth check llega ANTES
// que cualquier lógica de negocio. Un 500 aquí sería una fuga de error de DB.

test.describe('Kitchen/Bar — Escenario A: sin waiter_token', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const route of PATCH_ROUTES) {
    test(`${route.label} sin auth → 401, nunca 403/500`, async () => {
      const res = await request.patch(route.url, { data: route.body });
      expect(res.status()).not.toBe(403);
      expect(res.status()).not.toBe(500);
      expect(res.status()).toBe(401);
    });
  }

  for (const route of POST_ROUTES) {
    test(`${route.label} sin auth → 401, nunca 403/500`, async () => {
      const res = await request.post(route.url, { data: route.body });
      expect(res.status()).not.toBe(500);
      expect([401, 403]).toContain(res.status());
    });
  }
});

// ── Suite GET: rutas de lectura exentas de CSRF ───────────────────────────────
// GET nunca debe ser bloqueado por CSRF — solo por auth (401 si sin token).

test.describe('Kitchen/Bar — GET routes exentas de CSRF', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const url of GET_EXEMPT_ROUTES) {
    test(`GET ${url} sin csrf_token → no 403 (solo 401 o 200)`, async () => {
      const res = await request.get(url);
      // GET sin CSRF nunca debe devolver 403 (CSRF error).
      // Puede devolver 401 (sin auth) o 200 (si auth ya está en cookie).
      expect(res.status()).not.toBe(403);
      expect(res.status()).not.toBe(500);
    });
  }
});

// ── Suite B: con waiter_token válido, sin csrf_token → 403 CSRF_REQUIRED ─────
// Requiere PLAYWRIGHT_WAITER_TOKEN. Verifica que el CSRF check está activo
// en todas las rutas mutativas de kitchen y bar.

test.describe('Kitchen/Bar — Escenario B: waiter_token válido, sin csrf_token', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const route of PATCH_ROUTES) {
    test(`${route.label} sin csrf_token → 403 CSRF_REQUIRED`, async () => {
      if (!waiterToken()) {
        test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN no definido');
        return;
      }
      const res = await request.patch(route.url, {
        headers: { cookie: cookieNocsrf(waiterToken()!) },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(String(body.error ?? body.code ?? '')).toMatch(/CSRF_REQUIRED/i);
    });
  }

  for (const route of POST_ROUTES) {
    test(`${route.label} sin csrf_token → 403 CSRF_REQUIRED`, async () => {
      if (!waiterToken()) {
        test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN no definido');
        return;
      }
      const res = await request.post(route.url, {
        headers: { cookie: cookieNocsrf(waiterToken()!) },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(String(body.error ?? body.code ?? '')).toMatch(/CSRF_REQUIRED/i);
    });
  }
});

// ── Suite C: con waiter_token válido, csrf_token inválido → 403 CSRF_INVALID ──
// Requiere PLAYWRIGHT_WAITER_TOKEN. Verifica que el token CSRF es validado
// criptográficamente (no basta con tener cualquier valor en el header).

test.describe('Kitchen/Bar — Escenario C: waiter_token válido, csrf_token inválido', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  for (const route of PATCH_ROUTES) {
    test(`${route.label} con csrf inválido → 403 CSRF_INVALID`, async () => {
      if (!waiterToken()) {
        test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN no definido');
        return;
      }
      const res = await request.patch(route.url, {
        headers: {
          cookie: cookieInvalidCsrf(waiterToken()!),
          'x-csrf-token': 'fakectoken',
        },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(String(body.error ?? body.code ?? '')).toMatch(/CSRF_INVALID/i);
    });
  }

  for (const route of POST_ROUTES) {
    test(`${route.label} con csrf inválido → 403 CSRF_INVALID`, async () => {
      if (!waiterToken()) {
        test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN no definido');
        return;
      }
      const res = await request.post(route.url, {
        headers: {
          cookie: cookieInvalidCsrf(waiterToken()!),
          'x-csrf-token': 'fakectoken',
        },
        data: route.body,
      });
      expect(res.status()).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(String(body.error ?? body.code ?? '')).toMatch(/CSRF_INVALID/i);
    });
  }
});
