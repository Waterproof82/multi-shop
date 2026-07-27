/**
 * E2E — Kitchen CSRF: browser-level regression test
 *
 * Detecta la regresión del 2026-07-26: las páginas de kitchen/bar enviaban
 * PATCH sin x-csrf-token porque POST /api/waiter/auth no setea csrf_token.
 * getCsrfToken() retornaba null → 403 en producción.
 *
 * DIFERENCIA con kitchen-bar-csrf.spec.ts (API-level):
 *   Los tests API se auto-proveen el csrf_token llamando GET /api/admin/login
 *   en beforeAll — nunca detectan si el CLIENTE lo obtiene correctamente.
 *   Este test usa un browser real: solo hace PIN login (sin precargar csrf_token)
 *   y luego verifica que la página obtiene el token automáticamente.
 *
 * Flujo que reproduce la regresión:
 *   1. POST /api/waiter/auth con PIN  → waiter_token ✅, csrf_token ❌
 *   2. Navegar a /kitchen             → ensureCsrfToken() en mount → csrf_token ✅
 *   3. PATCH desde el browser         → x-csrf-token presente → no 403
 *
 * Auth: se autentica UNA sola vez en beforeAll para no agotar el rate limiter
 * (5 auth/min por IP). Cada test inyecta el waiter_token via context.addCookies().
 *
 * Variables de entorno requeridas:
 *   PLAYWRIGHT_WAITER_PIN — PIN numérico del camarero. Sin él el test se salta.
 */

import { test, expect } from '@playwright/test';

const DUMMY_UUID = '00000000-0000-0000-0000-000000000099';

let sharedWaiterToken: string | undefined;

test.describe.serial('Kitchen CSRF — browser client flow', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const pin = process.env.PLAYWRIGHT_WAITER_PIN;
    if (!pin) return;

    const ctx = await playwright.request.newContext({ baseURL });
    const authRes = await ctx.post('/api/waiter/auth', { data: { pin } });
    if (authRes.ok()) {
      const raw = authRes.headers()['set-cookie'] ?? '';
      const match = raw.match(/(?:^|;\s*)waiter_token=([^;]+)/);
      if (match) sharedWaiterToken = decodeURIComponent(match[1]);
    }
    await ctx.dispose();
  });

  test('csrf_token se obtiene automáticamente tras waiter PIN login', async ({ page, context }) => {
    if (!sharedWaiterToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }

    await context.addCookies([{
      name: 'waiter_token',
      value: sharedWaiterToken,
      domain: new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').hostname,
      path: '/',
    }]);

    await page.goto('/kitchen');
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    const status = await page.evaluate(async (dummyUuid: string) => {
      const cookieEntry = document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='));
      const csrfToken = cookieEntry
        ? decodeURIComponent(cookieEntry.split('=').slice(1).join('=')).split(':')[0]
        : null;

      const res = await fetch(`/api/kitchen/items/${dummyUuid}/0/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ estado: 'en_preparacion' }),
      });
      return res.status;
    }, DUMMY_UUID);

    expect(status).not.toBe(403);
  });

  test('waiter/kitchen page: csrf_token se obtiene automáticamente tras PIN login', async ({ page, context }) => {
    if (!sharedWaiterToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }

    await context.addCookies([{
      name: 'waiter_token',
      value: sharedWaiterToken,
      domain: new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').hostname,
      path: '/',
    }]);

    await page.goto('/waiter/kitchen');
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    const status = await page.evaluate(async (dummyUuid: string) => {
      const cookieEntry = document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='));
      const csrfToken = cookieEntry
        ? decodeURIComponent(cookieEntry.split('=').slice(1).join('=')).split(':')[0]
        : null;

      const res = await fetch(`/api/waiter/kitchen/items/${dummyUuid}/0/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ estado: 'listo' }),
      });
      return res.status;
    }, DUMMY_UUID);

    expect(status).not.toBe(403);
  });

  test('waiter/bar page: csrf_token se obtiene automáticamente tras PIN login', async ({ page, context }) => {
    if (!sharedWaiterToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }

    await context.addCookies([{
      name: 'waiter_token',
      value: sharedWaiterToken,
      domain: new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').hostname,
      path: '/',
    }]);

    await page.goto('/waiter/bar');
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    const status = await page.evaluate(async (dummyUuid: string) => {
      const cookieEntry = document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='));
      const csrfToken = cookieEntry
        ? decodeURIComponent(cookieEntry.split('=').slice(1).join('=')).split(':')[0]
        : null;

      const res = await fetch(`/api/waiter/kitchen/items/${dummyUuid}/0/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ estado: 'servido' }),
      });
      return res.status;
    }, DUMMY_UUID);

    expect(status).not.toBe(403);
  });

  test('waiter/pendientes page: csrf_token se obtiene automáticamente tras PIN login', async ({ page, context }) => {
    // Regresión 2026-07-26: updateItemPase / releaseRetainedPedidoItems / cancel loop
    // usaban fetch() plano sin x-csrf-token. Con PIN-only login → 403.
    if (!sharedWaiterToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }

    await context.addCookies([{
      name: 'waiter_token',
      value: sharedWaiterToken,
      domain: new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').hostname,
      path: '/',
    }]);

    await page.goto('/waiter/pendientes');
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    const status = await page.evaluate(async (dummyUuid: string) => {
      const cookieEntry = document.cookie.split(';').find(c => c.trim().startsWith('csrf_token='));
      const csrfToken = cookieEntry
        ? decodeURIComponent(cookieEntry.split('=').slice(1).join('=')).split(':')[0]
        : null;

      // Ejercita el mismo endpoint que updateItemPase / releaseRetainedPedidoItems
      const res = await fetch(`/api/waiter/kitchen/items/${dummyUuid}/0/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ estado: 'pendiente' }),
      });
      return res.status;
    }, DUMMY_UUID);

    // 403 → regresión: csrf_token no disponible tras PIN login.
    // 4xx distinto de 403 o 500 → aceptable (negocio/FK dummy).
    expect(status).not.toBe(403);
  });
});
