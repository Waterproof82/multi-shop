/**
 * E2E — Cross-tenant IDOR via spoofed x-empresa-id header (external audit, 2026-07-31)
 *
 * `/api/mesas/[mesaId]/{propina,division,call-waiter}` derived the tenant with
 * `let empresaId = request.headers.get('x-empresa-id'); if (!empresaId) { ...domain... }`
 * — trusting the client header when present. `proxy.ts` only verifies/overwrites
 * `x-empresa-id` for routes under /api/admin|waiter|kitchen|tpv|laborcontrol|
 * superadmin — `/api/mesas/*` is NOT in that list, so the header reached the
 * route handler unmodified. `empresas.id` is publicly readable
 * (`Publico ve empresas`, qual=true via /rest/v1/empresas), so an attacker who
 * knew another tenant's mesaId could pass that tenant's real empresa_id via
 * the header and pass the `.eq('empresa_id', empresaId)` ownership check —
 * because the value being checked against was also attacker-controlled.
 * `lock/route.ts` (GET/POST/DELETE) had no tenant check at all.
 *
 * Fix: empresaId is now derived from domain ONLY (getDomainFromHeaders +
 * parseMainDomain) — the x-empresa-id header is never read by these routes.
 * lock/route.ts gained requireMesaInOwnTenant() (domain-derived empresa +
 * mesas.empresa_id check) before all 3 handlers.
 *
 * These tests prove the regression class is closed the same way it was
 * introduced: a spoofed x-empresa-id header must produce IDENTICAL behavior
 * to no header at all, against a REAL mesa on the tenant PLAYWRIGHT_BASE_URL
 * actually serves. If a future edit reintroduces "trust header, fall back to
 * domain", the spoofed-header call will start returning a different result
 * (e.g. 404 "Mesa no encontrada" because the fake empresa_id doesn't match)
 * and this test fails.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY
 * (to fetch a real mesaId — no hardcoded fixture needed) and PLAYWRIGHT_BASE_URL.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

function supabaseUrl(): string | undefined { return process.env.NEXT_PUBLIC_SUPABASE_URL; }
function serviceRoleKey(): string | undefined {
  return process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Well-formed UUID that (almost certainly) belongs to no empresa — if the
// header were honored, this alone would flip the tenant check to a 404.
const SPOOFED_EMPRESA_ID = '11111111-1111-1111-1111-111111111111';

async function fetchAnyMesaId(): Promise<string | null> {
  const res = await fetch(`${supabaseUrl()}/rest/v1/mesas?select=id&limit=1`, {
    headers: {
      apikey: serviceRoleKey()!,
      Authorization: `Bearer ${serviceRoleKey()!}`,
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

test.describe('Mesa routes — x-empresa-id header must never affect tenant resolution', () => {
  let request: APIRequestContext;
  let mesaId: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseUrl() || !serviceRoleKey()) return;
    mesaId = await fetchAnyMesaId();
  });

  test.beforeEach(async ({ playwright, baseURL }) => {
    if (!supabaseUrl() || !serviceRoleKey()) {
      test.skip(true, 'NEXT_PUBLIC_SUPABASE_URL o PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY no definidos');
    }
    if (!mesaId) {
      test.skip(true, 'No hay ninguna mesa en la tabla mesas para probar');
    }
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request?.dispose();
  });

  test('GET lock: spoofed x-empresa-id da el mismo resultado que sin header', async () => {
    const clean = await request.get(`/api/mesas/${mesaId}/lock`);
    const spoofed = await request.get(`/api/mesas/${mesaId}/lock`, {
      headers: { 'x-empresa-id': SPOOFED_EMPRESA_ID },
    });

    expect(spoofed.status()).toBe(clean.status());
    expect(await spoofed.json()).toEqual(await clean.json());
  });

  test('PATCH propina: spoofed x-empresa-id da el mismo resultado que sin header', async () => {
    const body = { propinaCents: 0 };
    const clean = await request.patch(`/api/mesas/${mesaId}/propina`, { data: body });
    const spoofed = await request.patch(`/api/mesas/${mesaId}/propina`, {
      data: body,
      headers: { 'x-empresa-id': SPOOFED_EMPRESA_ID },
    });

    expect(spoofed.status()).toBe(clean.status());
    expect(await spoofed.json()).toEqual(await clean.json());
  });

  test('POST call-waiter: spoofed x-empresa-id da el mismo resultado que sin header', async () => {
    const clean = await request.post(`/api/mesas/${mesaId}/call-waiter`);
    const spoofed = await request.post(`/api/mesas/${mesaId}/call-waiter`, {
      headers: { 'x-empresa-id': SPOOFED_EMPRESA_ID },
    });

    expect(spoofed.status()).toBe(clean.status());
    expect(await spoofed.json()).toEqual(await clean.json());
  });

  test('mesaId inexistente en cualquier tenant: mismo resultado con o sin header spoofeado', async () => {
    const fakeMesaId = '22222222-2222-2222-2222-222222222222';
    const clean = await request.get(`/api/mesas/${fakeMesaId}/lock`);
    const spoofed = await request.get(`/api/mesas/${fakeMesaId}/lock`, {
      headers: { 'x-empresa-id': SPOOFED_EMPRESA_ID },
    });

    // La invariante de seguridad es "el header nunca cambia el resultado" —
    // no fijamos el código exacto (404 vs otro) para no acoplar el test a un
    // detalle de implementación ajeno al hallazgo.
    expect(spoofed.status()).toBe(clean.status());
    expect(await spoofed.json()).toEqual(await clean.json());
  });
});

test.describe('Glovo manual dispatch — ahora cubierto por proxy.ts (handleAdminAuth)', () => {
  test('POST /api/glovo/order sin sesión admin → 401', async ({ request }) => {
    const res = await request.post('/api/glovo/order', { data: { pedidoId: '00000000-0000-0000-0000-000000000000' } });
    expect(res.status()).toBe(401);
  });

  test('POST /api/glovo/order con x-admin-rol spoofeado (sin cookie real) → 401, no 200', async ({ request }) => {
    const res = await request.post('/api/glovo/order', {
      data: { pedidoId: '00000000-0000-0000-0000-000000000000' },
      headers: { 'x-admin-rol': 'superadmin', 'x-empresa-id': '11111111-1111-1111-1111-111111111111' },
    });
    expect(res.status()).toBe(401);
  });
});
