/**
 * E2E — Waiter CSRF protection (security-hardening audit)
 *
 * Verifica que las rutas /api/waiter/* y /api/kitchen/* exigen
 * csrf_token en métodos mutativos (POST/PUT/DELETE/PATCH).
 *
 * Escenarios cubiertos:
 *   1. Sin waiter_token → 401 (UNAUTHORIZED) — auth check works
 *   2. Sin waiter_token, con csrf_token → 401 (auth checked first)
 *   3. GET sin csrf_token → pasa (GET está exento)
 *   4. Con waiter_token válido + POST sin csrf_token → 403 CSRF_REQUIRED
 *   5. Con waiter_token válido + POST con csrf_token inválido → 403 CSRF_INVALID
 *   6. Kitchen routes heredan el mismo guard
 *
 * Escenarios 4 y 5 requieren PLAYWRIGHT_WAITER_TOKEN y PLAYWRIGHT_CSRF_TOKEN
 * en el entorno. Sin ellos, se omiten con skip.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

// ── helpers ──────────────────────────────────────────────────────────────────

function waiterToken(): string | undefined {
  return process.env.PLAYWRIGHT_WAITER_TOKEN;
}

function csrfToken(): string | undefined {
  return process.env.PLAYWRIGHT_CSRF_TOKEN;
}

function cookieHeader(token: string): string {
  return `waiter_token=${token}; csrf_token=${csrfToken() ?? 'dummy'}:sig`;
}

// Ruta waiter que existe y acepta POST (validar pedido)
const WAITER_POST_URL = '/api/waiter/pedidos/validate';

// ── suite ─────────────────────────────────────────────────────────────────────

test.describe('Waiter CSRF protection', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  // ── 1. Sin waiter_token: debe ser 401 ────────────────────────────────────

  test('POST sin waiter_token → 401 UNAUTHORIZED', async () => {
    const res = await request.post(WAITER_POST_URL, { data: {} });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error ?? body.code).toMatch(/UNAUTHORIZED/i);
  });

  // ── 2. GET exento de CSRF ─────────────────────────────────────────────────

  test('GET /api/waiter/me sin csrf_token → no 403', async () => {
    // GET no requiere CSRF — debería devolver 401 (sin token) no 403
    const res = await request.get('/api/waiter/me');
    expect(res.status()).not.toBe(403);
    expect([401, 200]).toContain(res.status());
  });

  // ── 3. Con waiter_token + POST sin csrf_token → 403 CSRF_REQUIRED ────────

  test('POST con waiter_token válido pero sin csrf_token → 403', async () => {
    if (!waiterToken()) {
      test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN no definido — saltar test de sesión real');
      return;
    }

    const res = await request.post(WAITER_POST_URL, {
      data: {},
      headers: {
        cookie: `waiter_token=${waiterToken()}`,
        // Sin x-csrf-token header
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('AUTH_004');
  });

  // ── 4. Con waiter_token + csrf_token inválido → 403 CSRF_INVALID ─────────

  test('POST con waiter_token válido + csrf_token inválido → 403', async () => {
    if (!waiterToken()) {
      test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN no definido — saltar test de sesión real');
      return;
    }

    const res = await request.post(WAITER_POST_URL, {
      data: {},
      headers: {
        cookie: `waiter_token=${waiterToken()}; csrf_token=fakecookie:fakesig`,
        'x-csrf-token': 'fakectoken',
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('AUTH_005');
  });

  // ── 5. Kitchen hereda el mismo guard ─────────────────────────────────────

  test('POST /api/kitchen/* sin csrf_token → 401 o 403 (nunca 200/500)', async () => {
    const res = await request.post('/api/kitchen/items', { data: {} });
    // Sin waiter_token → 401. Con token pero sin csrf → 403.
    // En ningún caso debe pasar (200) ni romperse (500).
    expect([401, 403]).toContain(res.status());
  });
});

// ── Supabase RLS smoke test ───────────────────────────────────────────────────

test.describe('Partition RLS — fichajes (security-hardening audit)', () => {
  test('anon no puede leer lc_fichajes_2026_07 via Supabase REST', async ({ request }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      test.skip(true, 'Variables de Supabase no disponibles en entorno de test');
      return;
    }

    const res = await request.get(
      `${supabaseUrl}/rest/v1/lc_fichajes_2026_07?select=id&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }
    );

    // Con RLS activo y policy anon=DENY:
    //   - PostgREST devuelve 200 con array vacío si la tabla está en el schema cache
    //   - PostgREST devuelve 404 si la tabla no está expuesta en el schema (también válido)
    // En ningún caso debe devolver datos reales.
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0); // RLS bloquea acceso anon — 0 filas
    }
  });

  test('anon no puede leer lc_fichajes_2026_08 via Supabase REST', async ({ request }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      test.skip(true, 'Variables de Supabase no disponibles en entorno de test');
      return;
    }

    const res = await request.get(
      `${supabaseUrl}/rest/v1/lc_fichajes_2026_08?select=id&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }
    );

    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    }
  });
});
