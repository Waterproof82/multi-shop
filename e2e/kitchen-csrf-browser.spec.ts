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
 * Variables de entorno requeridas:
 *   PLAYWRIGHT_WAITER_PIN — PIN numérico del camarero. Sin él el test se salta.
 */

import { test, expect } from '@playwright/test';

const DUMMY_UUID = '00000000-0000-0000-0000-000000000099';

test.describe('Kitchen CSRF — browser client flow', () => {
  test('csrf_token se obtiene automáticamente tras waiter PIN login', async ({ page, context }) => {
    const pin = process.env.PLAYWRIGHT_WAITER_PIN;
    if (!pin) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }

    // 1. Login como camarero — solo setea waiter_token, NO csrf_token.
    //    Este es el estado real del browser antes de que la página cargue.
    const authRes = await context.request.post('/api/waiter/auth', { data: { pin } });
    expect(authRes.ok()).toBeTruthy();

    // 2. Verificar que csrf_token NO existe aún (confirma la condición de regresión).
    const cookiesAfterAuth = await context.cookies();
    const csrfAfterAuth = cookiesAfterAuth.find(c => c.name === 'csrf_token');
    expect(csrfAfterAuth).toBeUndefined(); // waiter/auth no lo setea — este es el gap

    // 3. Navegar a la kitchen page — ensureCsrfToken() en mount debe obtenerlo.
    // networkidle nunca dispara porque la página tiene Realtime subscriptions.
    // Esperamos 'load' + 2s para que ensureCsrfToken() en mount complete.
    await page.goto('/kitchen');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    // 4. Verificar que csrf_token existe AHORA en el browser context.
    const cookiesAfterLoad = await context.cookies();
    const csrfAfterLoad = cookiesAfterLoad.find(c => c.name === 'csrf_token');
    expect(csrfAfterLoad).toBeDefined(); // la página lo obtuvo automáticamente

    // 5. Verificar que un PATCH desde el browser NO recibe 403.
    //    Usa el csrf_token del document.cookie — exactamente como hace getCsrfToken().
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

    // 403 → regresión: el header CSRF no se envió (token no disponible).
    // 500 → DB error por UUID dummy — aceptable, el CSRF pasó.
    // 4xx distinto de 403 → también aceptable (negocio).
    expect(status).not.toBe(403);
  });

  test('waiter/kitchen page: csrf_token se obtiene automáticamente tras PIN login', async ({ page, context }) => {
    const pin = process.env.PLAYWRIGHT_WAITER_PIN;
    if (!pin) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }

    const authRes = await context.request.post('/api/waiter/auth', { data: { pin } });
    expect(authRes.ok()).toBeTruthy();

    await page.goto('/waiter/kitchen');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    const cookiesAfterLoad = await context.cookies();
    const csrfAfterLoad = cookiesAfterLoad.find(c => c.name === 'csrf_token');
    expect(csrfAfterLoad).toBeDefined();

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
    const pin = process.env.PLAYWRIGHT_WAITER_PIN;
    if (!pin) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }

    const authRes = await context.request.post('/api/waiter/auth', { data: { pin } });
    expect(authRes.ok()).toBeTruthy();

    await page.goto('/waiter/bar');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    const cookiesAfterLoad = await context.cookies();
    const csrfAfterLoad = cookiesAfterLoad.find(c => c.name === 'csrf_token');
    expect(csrfAfterLoad).toBeDefined();

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
});
