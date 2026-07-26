/**
 * E2E — Regresión: pendientes ↔ kitchen routing (2026-07-27)
 *
 * Bug A: Items retenidos con from_validation=true aparecían en kitchen con
 *   estado='pendiente' (defaultEstado fallback). Fix: pendientesRetainedSet
 *   en fetchAllComidaItems excluye esos ítems del resultado.
 *
 * Bug B: Al validar con sendTipo='bebida', la actualización optimista del UI
 *   eliminaba TODOS los ítems del pedido (incluida comida). Fix: sentIndices
 *   solo incluye ítems del sendTipo que realmente salen de pendientes.
 *   Test server-side: tras validate con retainIndices=[0], pendientes debe
 *   devolver el ítem de comida como validated+retenido.
 *
 * Suites:
 *   1. Siempre: shape/contract sin datos — auth barrier y formato de respuesta
 *   2. Con PIN: comportamiento con auth real, datos de negocio opcionales
 *   3. Con PIN + service role: regresión completa con datos sintéticos
 *
 * Variables de entorno:
 *   PLAYWRIGHT_WAITER_PIN                  — PIN numérico del camarero
 *   NEXT_PUBLIC_SUPABASE_URL               — URL de Supabase
 *   PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY   — service role key para datos de test
 */

import { randomUUID } from 'crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';

// ── Auth compartida entre suites ──────────────────────────────────────────────

let sessionWaiterToken: string | undefined;
let sessionCsrfCookie: string | undefined;
let sessionCsrfToken: string | undefined;
let sessionEmpresaId: string | undefined;

function parseCookieValue(setCookieHeader: string, name: string): string | undefined {
  for (const line of setCookieHeader.split('\n')) {
    const match = line.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return undefined;
}

test.beforeAll(async ({ playwright, baseURL }) => {
  const pin = process.env.PLAYWRIGHT_WAITER_PIN;
  if (!pin) return;

  const ctx = await playwright.request.newContext({ baseURL });

  // 1. CSRF token (endpoint público)
  const csrfRes = await ctx.get('/api/admin/login');
  if (csrfRes.ok()) {
    const raw = csrfRes.headers()['set-cookie'] ?? '';
    sessionCsrfCookie = parseCookieValue(raw, 'csrf_token');
    sessionCsrfToken  = sessionCsrfCookie?.split(':')[0];
  }

  // 2. waiter_token
  const authRes = await ctx.post('/api/waiter/auth', { data: { pin } });
  if (authRes.ok()) {
    const raw = authRes.headers()['set-cookie'] ?? '';
    sessionWaiterToken = parseCookieValue(raw, 'waiter_token');
  }

  // 3. empresa_id del camarero autenticado
  if (sessionWaiterToken) {
    const meRes = await ctx.get('/api/waiter/me', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    if (meRes.ok()) {
      const body = await meRes.json() as { empresaId?: string };
      sessionEmpresaId = body.empresaId;
    }
  }

  await ctx.dispose();
});

// ── Suite 1: Auth barrier — siempre corre, sin variables de entorno ───────────

test.describe('Routing — auth barrier (sin vars de entorno)', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });
  test.afterEach(async () => { await request.dispose(); });

  test('GET /api/waiter/kitchen/items sin token → 401, nunca 500', async () => {
    const res = await request.get('/api/waiter/kitchen/items');
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/waiter/pendientes/orders sin token → 401, nunca 500', async () => {
    const res = await request.get('/api/waiter/pendientes/orders');
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/waiter/pendientes/validate sin token → 401, nunca 500', async () => {
    const res = await request.post('/api/waiter/pendientes/validate', {
      data: { pedidoId: '00000000-0000-0000-0000-000000000099' },
    });
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });
});

// ── Suite 2: Comportamiento con auth real (requiere PLAYWRIGHT_WAITER_PIN) ────

test.describe('Routing — con auth real (requiere PLAYWRIGHT_WAITER_PIN)', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });
  test.afterEach(async () => { await request.dispose(); });

  test('GET /api/waiter/kitchen/items → 200 con array de items válidos', async () => {
    if (!sessionWaiterToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }
    const res = await request.get('/api/waiter/kitchen/items', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { items: Array<Record<string, unknown>> };
    expect(Array.isArray(body.items)).toBe(true);
    // Cada ítem debe tener los campos de KitchenItemRecord y un estado kitchen-válido
    const VALID_ESTADOS = new Set(['pendiente', 'en_preparacion', 'listo', 'retenido']);
    for (const item of body.items) {
      expect(typeof item['pedidoId']).toBe('string');
      expect(typeof item['nombre']).toBe('string');
      expect(typeof item['itemIdx']).toBe('number');
      expect(VALID_ESTADOS.has(item['estado'] as string)).toBe(true);
    }
  });

  test('GET /api/waiter/pendientes/orders → 200 con array de mesas', async () => {
    if (!sessionWaiterToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }
    const res = await request.get('/api/waiter/pendientes/orders', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { mesas: unknown[] };
    expect(Array.isArray(body.mesas)).toBe(true);
  });

  test('POST validate con UUID inexistente y CSRF correcto → 404, nunca 500', async () => {
    if (!sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o CSRF no disponible');
      return;
    }
    const res = await request.post('/api/waiter/pendientes/validate', {
      headers: {
        cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
        'x-csrf-token': sessionCsrfToken,
      },
      data: { pedidoId: '00000000-0000-0000-0000-000000000099', retainIndices: [0] },
    });
    expect(res.status()).not.toBe(500);
    expect([404, 409]).toContain(res.status());
  });
});

// ── Suite 3: Regresión Bug A & B — requiere PIN + service role ────────────────
//
// Crea un pedido sintético en estado 'pendiente' con un ítem de comida
// y un pedido_item_estados con from_validation=true (simula post-validate).
// Verifica:
//   Bug A: el ítem NO aparece en kitchen (fetchAllComidaItems lo excluye)
//   Bug B: el ítem SÍ aparece en pendientes (addValidatedRetenidos lo incluye)
// Cleanup: actualiza el pedido a 'cancelado' (DELETE bloqueado por trigger LGT).

test.describe('Bug A+B regression — from_validation=true routing (requiere PIN + service role)', () => {
  let request: APIRequestContext;
  let testPedidoId: string | undefined;

  const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY;

  function supabaseHeaders() {
    return {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
  }

  test.beforeAll(async ({ playwright, baseURL }) => {
    if (!sessionWaiterToken || !sessionEmpresaId || !supabaseUrl || !serviceRoleKey) return;

    const appCtx = await playwright.request.newContext({ baseURL });
    const dbCtx  = await playwright.request.newContext({ baseURL: supabaseUrl });

    try {
      // 1. Obtener primera mesa válida del camarero
      const mesasRes = await appCtx.get('/api/waiter/mesas', {
        headers: { cookie: `waiter_token=${sessionWaiterToken}` },
      });
      if (!mesasRes.ok()) return;
      const mesasBody = await mesasRes.json() as { mesas: Array<{ id: string }> };
      const mesaId = mesasBody.mesas[0]?.id;
      if (!mesaId) return;

      // 2. Crear pedido sintético en estado 'pendiente' (incluye ítem comida)
      const testId = randomUUID();
      const insertRes = await dbCtx.post('/rest/v1/pedidos', {
        headers: supabaseHeaders(),
        data: {
          id: testId,
          empresa_id: sessionEmpresaId,
          mesa_id: mesaId,
          estado: 'pendiente',
          detalle_pedido: [
            { nombre: '__test_comida__', cantidad: 1, precio: 0, tipo_producto: 'comida' },
          ],
        },
      });

      if (!insertRes.ok()) return; // INSERT falló (p.ej. NOT NULL constraint) — skips gracefully
      testPedidoId = testId;

      // 3. Crear pedido_item_estados con from_validation=true (simula comida retenida en pendientes)
      await dbCtx.post('/rest/v1/pedido_item_estados', {
        headers: supabaseHeaders(),
        data: {
          pedido_id: testId,
          item_idx: 0,
          empresa_id: sessionEmpresaId,
          estado: 'retenido',
          from_validation: true,
          updated_at: new Date().toISOString(),
        },
      });
    } finally {
      await appCtx.dispose();
      await dbCtx.dispose();
    }
  });

  test.afterAll(async ({ playwright }) => {
    if (!testPedidoId || !supabaseUrl || !serviceRoleKey) return;

    const dbCtx = await playwright.request.newContext({ baseURL: supabaseUrl });
    // Cleanup: mover a 'cancelado' (DELETE bloqueado por trigger pedidos_no_delete LGT art.66)
    await dbCtx.patch(`/rest/v1/pedidos?id=eq.${testPedidoId}`, {
      headers: { ...supabaseHeaders(), Prefer: '' },
      data: { estado: 'cancelado' },
    });
    await dbCtx.delete(`/rest/v1/pedido_item_estados?pedido_id=eq.${testPedidoId}`, {
      headers: { ...supabaseHeaders(), Prefer: '' },
    });
    await dbCtx.dispose();
  });

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });
  test.afterEach(async () => { await request.dispose(); });

  test('Bug A: ítem comida con from_validation=true NO aparece en /api/waiter/kitchen/items', async () => {
    if (!testPedidoId || !sessionWaiterToken) {
      test.skip(true, 'Datos de test no creados — requiere PLAYWRIGHT_WAITER_PIN + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    const res = await request.get('/api/waiter/kitchen/items', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { items: Array<{ pedidoId: string; itemIdx: number }> };

    // El ítem de comida retenido (from_validation=true, idx=0) NO debe aparecer en kitchen
    const leaked = body.items.find(i => i.pedidoId === testPedidoId && i.itemIdx === 0);
    expect(leaked).toBeUndefined();
  });

  test('Bug B: ítem comida con from_validation=true SÍ aparece en /api/waiter/pendientes/orders como validated', async () => {
    if (!testPedidoId || !sessionWaiterToken) {
      test.skip(true, 'Datos de test no creados — requiere PLAYWRIGHT_WAITER_PIN + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    const res = await request.get('/api/waiter/pendientes/orders', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as {
      mesas: Array<{ pedidos: Array<{ id: string; validated?: boolean; items: unknown[] }> }>;
    };

    // El pedido debe aparecer como validated=true con su ítem de comida
    const allPedidos = body.mesas.flatMap(m => m.pedidos);
    const found = allPedidos.find(p => p.id === testPedidoId);
    expect(found).toBeDefined();
    expect(found?.validated).toBe(true);
    expect(found?.items.length).toBeGreaterThan(0);
  });
});
