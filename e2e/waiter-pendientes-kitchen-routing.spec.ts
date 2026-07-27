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

  test('POST /api/waiter/mesa sin token → 401, nunca 500', async () => {
    const res = await request.post('/api/waiter/mesa', {
      data: { mesaNumero: 1 },
    });
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/waiter/mesa con waiter_token pero sin csrf_token → 403 (regresión)', async () => {
    const token = process.env.PLAYWRIGHT_WAITER_TOKEN ?? sessionWaiterToken;
    if (!token) {
      test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN o PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }
    const res = await request.post('/api/waiter/mesa', {
      headers: { cookie: `waiter_token=${token}` },
      data: { mesaNumero: 1 },
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/waiter/mesas/{id}/close sin token → 401, nunca 500', async () => {
    const res = await request.post('/api/waiter/mesas/00000000-0000-0000-0000-000000000001/close');
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/waiter/mesas/{id}/open sin token → 401, nunca 500', async () => {
    const res = await request.post('/api/waiter/mesas/00000000-0000-0000-0000-000000000001/open');
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/waiter/mesas/{id}/dismiss-call sin token → 401, nunca 500', async () => {
    const res = await request.post('/api/waiter/mesas/00000000-0000-0000-0000-000000000001/dismiss-call');
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/waiter/mesas/{id}/close con token pero sin csrf_token → 403 (regresión)', async () => {
    const token = process.env.PLAYWRIGHT_WAITER_TOKEN ?? sessionWaiterToken;
    if (!token) {
      test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN o PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }
    const res = await request.post('/api/waiter/mesas/00000000-0000-0000-0000-000000000001/close', {
      headers: { cookie: `waiter_token=${token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('POST /api/waiter/mesas/{id}/open con token pero sin csrf_token → 403 (regresión)', async () => {
    const token = process.env.PLAYWRIGHT_WAITER_TOKEN ?? sessionWaiterToken;
    if (!token) {
      test.skip(true, 'PLAYWRIGHT_WAITER_TOKEN o PLAYWRIGHT_WAITER_PIN no definido');
      return;
    }
    const res = await request.post('/api/waiter/mesas/00000000-0000-0000-0000-000000000001/open', {
      headers: { cookie: `waiter_token=${token}` },
    });
    expect(res.status()).toBe(403);
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

  test('POST /api/waiter/mesa con CSRF correcto + mesa válida → 200 con mesaId', async () => {
    if (!sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o CSRF no disponible');
      return;
    }
    const res = await request.post('/api/waiter/mesa', {
      headers: {
        cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
        'x-csrf-token': sessionCsrfToken,
      },
      data: { mesaNumero: 1 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { mesaId: string; mesaNumero: number };
    expect(typeof body.mesaId).toBe('string');
    expect(body.mesaNumero).toBe(1);
  });

  test('POST /api/waiter/mesa con CSRF correcto + mesa inexistente → 404, nunca 500', async () => {
    if (!sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
      test.skip(true, 'PLAYWRIGHT_WAITER_PIN no definido o CSRF no disponible');
      return;
    }
    const res = await request.post('/api/waiter/mesa', {
      headers: {
        cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
        'x-csrf-token': sessionCsrfToken,
      },
      data: { mesaNumero: 99999 },
    });
    expect(res.status()).not.toBe(500);
    expect(res.status()).toBe(404);
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
          total: 0,
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

// ── Suite 4: Regresión Bug C — pedido mixto en estado 'anotado' ──────────────
//
// Reproduce la trampa documentada en docs/context/waiter-panel.md:
// cuando el bar sirve las bebidas de un pedido mixto, el pedido pasa de
// 'pendiente' a 'anotado'. Si findPendientesValidacion filtra solo por
// estado='pendiente', la comida retenida desaparece de /waiter/pendientes.
//
// Fix: .in('estado', ['pendiente', 'anotado']) en supabase-pedido.repository.ts

test.describe('Bug C regression — comida retenida con pedido en estado anotado (requiere PIN + service role)', () => {
  let request: APIRequestContext;
  let testPedidoId: string | undefined;

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
      // Obtener primera mesa válida
      const mesasRes = await appCtx.get('/api/waiter/mesas', {
        headers: { cookie: `waiter_token=${sessionWaiterToken}` },
      });
      if (!mesasRes.ok()) return;
      const mesasBody = await mesasRes.json() as { mesas: Array<{ id: string }> };
      const mesaId = mesasBody.mesas[0]?.id;
      if (!mesaId) return;

      // Crear pedido sintético en estado 'anotado' (simula: bar sirvió bebidas en pedido mixto)
      const testId = randomUUID();
      const insertRes = await dbCtx.post('/rest/v1/pedidos', {
        headers: supabaseHeaders(),
        data: {
          id: testId,
          empresa_id: sessionEmpresaId,
          total: 0,
          mesa_id: mesaId,
          estado: 'anotado',
          detalle_pedido: [
            { nombre: '__test_comida_anotado__', cantidad: 1, precio: 0, tipo_producto: 'comida' },
          ],
        },
      });

      if (!insertRes.ok()) return;
      testPedidoId = testId;

      // Crear ítem retenido con from_validation=true (comida enviada de vuelta a pendientes)
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

  test('Bug C: comida retenida (from_validation=true) en pedido "anotado" SÍ aparece en /api/waiter/pendientes/orders', async () => {
    // Regresión: findPendientesValidacion filtraba solo estado='pendiente'.
    // Cuando el bar sirve bebidas de un pedido mixto, el pedido pasa a 'anotado'
    // y la comida desaparecía de la vista del camarero.
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

    const allPedidos = body.mesas.flatMap(m => m.pedidos);
    const found = allPedidos.find(p => p.id === testPedidoId);

    // Si falla aquí → findPendientesValidacion no incluye 'anotado' en el filtro de estado.
    expect(found).toBeDefined();
    expect(found?.validated).toBe(true);
    expect(found?.items.length).toBeGreaterThan(0);
  });

  test('Bug C: comida retenida (from_validation=true) en pedido "anotado" NO aparece en /api/waiter/kitchen/items', async () => {
    if (!testPedidoId || !sessionWaiterToken) {
      test.skip(true, 'Datos de test no creados — requiere PLAYWRIGHT_WAITER_PIN + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    const res = await request.get('/api/waiter/kitchen/items', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as { items: Array<{ pedidoId: string; itemIdx: number }> };

    // El ítem no debe filtrarse hacia la cocina — sigue retenido en pendientes
    const leaked = body.items.find(i => i.pedidoId === testPedidoId && i.itemIdx === 0);
    expect(leaked).toBeUndefined();
  });
});

// ── Suite 5: Regresión "lanzar pase + pausa" ─────────────────────────────────
//
// Reproduce el bug 2026-07-27: "Lanzar Xº pase" enviaba a cocina los ítems
// que el camarero había marcado como pausados.
//
// Root cause: processPaseItemsForPedido incluía todos los ítems del pase en
// selectedForPedido (incluyendo pausados). En validateNewPedido, los pausados
// caían en pausedIndices → from_validation=false → kitchen retenidos.
//
// Fix: los pausados se excluyen de selectedForPedido → caen en retainIndices
// → from_validation=true → se quedan en la cola de pendientes.
//
// Esta suite verifica el CONTRATO del endpoint /api/waiter/pendientes/validate:
//
//   retainIndices=[idx]  → from_validation=true  → ítem en PENDIENTES, NO en kitchen
//   pausedIndices=[idx]  → from_validation=false → ítem en KITCHEN como retenido, NO en pendientes
//
// El cliente (processPaseItemsForPedido) debe enviar ítems pausados como
// retainIndices (no en selected → notSelectedOfTipo), nunca como pausedIndices.

test.describe('Suite 5 — lanzar pase + pausa: retainIndices vs pausedIndices (requiere PIN + service role)', () => {
  let request: APIRequestContext;

  // Pedido A: ítem 0 en retainIndices → debe quedarse en pendientes (from_validation=true)
  let pedidoRetainId: string | undefined;
  // Pedido B: ítem 0 en pausedIndices → debe ir a kitchen como retenido (from_validation=false)
  let pedidoPausedId: string | undefined;
  // Pedido C: ya validado (estado='pendiente') con ítem retenido (from_validation=true).
  //           Simula releaseRetainedPedidoItems para ítems pausados — PATCH estado='retenido'
  //           debe moverlo a kitchen retenidos (from_validation=false).
  let pedidoValidatedPausedId: string | undefined;

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
      const mesasRes = await appCtx.get('/api/waiter/mesas', {
        headers: { cookie: `waiter_token=${sessionWaiterToken}` },
      });
      if (!mesasRes.ok()) return;
      const mesasBody = await mesasRes.json() as { mesas: Array<{ id: string }> };
      const mesaId = mesasBody.mesas[0]?.id;
      if (!mesaId) return;

      // Crear pedido A — para verificar retainIndices (comida que se queda en pendientes)
      const idA = randomUUID();
      const resA = await dbCtx.post('/rest/v1/pedidos', {
        headers: supabaseHeaders(),
        data: {
          id: idA,
          empresa_id: sessionEmpresaId,
          total: 0,
          mesa_id: mesaId,
          estado: 'pendiente_validacion',
          detalle_pedido: [
            { nombre: '__test_pase_retain__', cantidad: 1, precio: 0, tipo_producto: 'comida' },
          ],
        },
      });
      if (resA.ok()) pedidoRetainId = idA;

      // Crear pedido B — para verificar pausedIndices (comida que va a kitchen retenido)
      const idB = randomUUID();
      const resB = await dbCtx.post('/rest/v1/pedidos', {
        headers: supabaseHeaders(),
        data: {
          id: idB,
          empresa_id: sessionEmpresaId,
          total: 0,
          mesa_id: mesaId,
          estado: 'pendiente_validacion',
          detalle_pedido: [
            { nombre: '__test_pase_paused__', cantidad: 1, precio: 0, tipo_producto: 'comida' },
          ],
        },
      });
      if (resB.ok()) pedidoPausedId = idB;

      // Crear pedido C — ya validado con un ítem retenido (from_validation=true).
      // Simula el path releaseRetainedPedidoItems para ítems pausados en pedidos ya
      // validados: PATCH con estado='retenido' → from_validation=false → kitchen retenidos.
      const idC = randomUUID();
      const resC = await dbCtx.post('/rest/v1/pedidos', {
        headers: supabaseHeaders(),
        data: {
          id: idC,
          empresa_id: sessionEmpresaId,
          total: 0,
          mesa_id: mesaId,
          estado: 'pendiente',
          validated_at: new Date().toISOString(),
          detalle_pedido: [
            { nombre: '__test_release_paused__', cantidad: 1, precio: 0, tipo_producto: 'comida' },
          ],
        },
      });
      if (resC.ok()) {
        pedidoValidatedPausedId = idC;
        // Pre-crear el ítem como from_validation=true (retenido en pendientes)
        await dbCtx.post('/rest/v1/pedido_item_estados', {
          headers: supabaseHeaders(),
          data: {
            pedido_id: idC,
            item_idx: 0,
            empresa_id: sessionEmpresaId,
            estado: 'retenido',
            from_validation: true,
            updated_at: new Date().toISOString(),
          },
        });
      }
    } finally {
      await appCtx.dispose();
      await dbCtx.dispose();
    }
  });

  test.afterAll(async ({ playwright }) => {
    if (!supabaseUrl || !serviceRoleKey) return;
    const dbCtx = await playwright.request.newContext({ baseURL: supabaseUrl });
    for (const id of [pedidoRetainId, pedidoPausedId, pedidoValidatedPausedId].filter(Boolean)) {
      await dbCtx.patch(`/rest/v1/pedidos?id=eq.${id}`, {
        headers: { ...supabaseHeaders(), Prefer: '' },
        data: { estado: 'cancelado' },
      });
      await dbCtx.delete(`/rest/v1/pedido_item_estados?pedido_id=eq.${id}`, {
        headers: { ...supabaseHeaders(), Prefer: '' },
      });
    }
    await dbCtx.dispose();
  });

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });
  test.afterEach(async () => { await request.dispose(); });

  // ── Contrato A: retainIndices → from_validation=true → ítem en PENDIENTES ────

  test('retainIndices=[0] → ítem queda en pendientes (from_validation=true), NO en kitchen', async () => {
    // Verifica el contrato de retainIndices: ítems que deben quedarse en pendientes
    // (e.g. retenidos por falta de stock). processPaseItemsForPedido NO usa este
    // camino para ítems pausados — los pausados van a pausedIndices (ver Contrato B).
    if (!pedidoRetainId || !sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
      test.skip(true, 'Requiere PLAYWRIGHT_WAITER_PIN + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    // Validar con ítem 0 en retainIndices (simula: ítem pausado excluido de selected)
    const validateRes = await request.post('/api/waiter/pendientes/validate', {
      headers: {
        cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
        'x-csrf-token': sessionCsrfToken,
      },
      data: { pedidoId: pedidoRetainId, retainIndices: [0], pausedIndices: [] },
    });
    expect(validateRes.status()).toBe(200);

    // Ítem 0 debe aparecer en pendientes (from_validation=true)
    const pendientesRes = await request.get('/api/waiter/pendientes/orders', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(pendientesRes.status()).toBe(200);
    const pendientesBody = await pendientesRes.json() as {
      mesas: Array<{ pedidos: Array<{ id: string; validated?: boolean }> }>;
    };
    const allPedidos = pendientesBody.mesas.flatMap(m => m.pedidos);
    const found = allPedidos.find(p => p.id === pedidoRetainId);
    // Si falla aquí → retainIndices no genera from_validation=true correctamente.
    expect(found).toBeDefined();
    expect(found?.validated).toBe(true);

    // Ítem 0 NO debe aparecer en kitchen
    const kitchenRes = await request.get('/api/waiter/kitchen/items', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(kitchenRes.status()).toBe(200);
    const kitchenBody = await kitchenRes.json() as { items: Array<{ pedidoId: string; itemIdx: number }> };
    const leaked = kitchenBody.items.find(i => i.pedidoId === pedidoRetainId && i.itemIdx === 0);
    // Si falla aquí → from_validation=true no está excluyendo el ítem de kitchen.
    expect(leaked).toBeUndefined();
  });

  // ── Contrato B: pausedIndices → from_validation=false → ítem en KITCHEN retenido ──

  test('pausedIndices=[0] → ítem va a kitchen como retenido (from_validation=false), NO en pendientes', async () => {
    // Verifica el contrato de pausedIndices: ítems pausados por el camarero en
    // "lanzar pase" van a kitchen como retenidos (from_validation=false, estado='retenido').
    // Esto es el comportamiento CORRECTO — processPaseItemsForPedido pone los pausados
    // en pausedForPedido que se pasa como pausedIndices a validateNewPedido.
    if (!pedidoPausedId || !sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
      test.skip(true, 'Requiere PLAYWRIGHT_WAITER_PIN + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    // Validar con ítem 0 en pausedIndices (simula el camino INCORRECTO que producía el bug)
    const validateRes = await request.post('/api/waiter/pendientes/validate', {
      headers: {
        cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
        'x-csrf-token': sessionCsrfToken,
      },
      data: { pedidoId: pedidoPausedId, retainIndices: [], pausedIndices: [0] },
    });
    expect(validateRes.status()).toBe(200);

    // Ítem 0 debe aparecer en kitchen como retenido (from_validation=false)
    const kitchenRes = await request.get('/api/waiter/kitchen/items', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(kitchenRes.status()).toBe(200);
    const kitchenBody = await kitchenRes.json() as { items: Array<{ pedidoId: string; itemIdx: number; estado: string }> };
    const inKitchen = kitchenBody.items.find(i => i.pedidoId === pedidoPausedId && i.itemIdx === 0);
    // Si falla aquí → pausedIndices no genera from_validation=false correctamente.
    expect(inKitchen).toBeDefined();
    expect(inKitchen?.estado).toBe('retenido');

    // Ítem 0 NO debe aparecer en pendientes
    const pendientesRes = await request.get('/api/waiter/pendientes/orders', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(pendientesRes.status()).toBe(200);
    const pendientesBody = await pendientesRes.json() as {
      mesas: Array<{ pedidos: Array<{ id: string }> }>;
    };
    const allPedidos = pendientesBody.mesas.flatMap(m => m.pedidos);
    const inPendientes = allPedidos.find(p => p.id === pedidoPausedId);
    // Si falla aquí → pausedIndices (from_validation=false) está apareciendo en pendientes
    // cuando no debería.
    expect(inPendientes).toBeUndefined();
  });

  // ── Contrato C: pedido ya validado — PATCH retenido mueve from_validation=true → false ──
  //
  // Simula releaseRetainedPedidoItems para ítems PAUSADOS en pedidos ya validados
  // (pedido.validated=true). La función llama PATCH con estado='retenido' en lugar de
  // 'pendiente'. upsertItemEstado siempre escribe from_validation=false, así que el ítem
  // debe aparecer en kitchen retenidos y desaparecer de pendientes.

  test('validated pedido + PATCH estado=retenido → from_validation=false en kitchen, NO en pendientes', async () => {
    if (!pedidoValidatedPausedId || !sessionWaiterToken || !sessionCsrfCookie || !sessionCsrfToken) {
      test.skip(true, 'Requiere PLAYWRIGHT_WAITER_PIN + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    // Simular lo que hace releaseRetainedPedidoItems para un ítem pausado en un pedido validado:
    // PATCH con estado='retenido' (en vez de 'pendiente') → from_validation=false
    const patchRes = await request.patch(
      `/api/waiter/kitchen/items/${pedidoValidatedPausedId}/0/status`,
      {
        headers: {
          cookie: `waiter_token=${sessionWaiterToken}; csrf_token=${sessionCsrfCookie}`,
          'x-csrf-token': sessionCsrfToken,
        },
        data: { estado: 'retenido' },
      }
    );
    // Si falla aquí → el endpoint no acepta estado='retenido' o hay error de auth.
    expect(patchRes.status()).toBe(200);

    // Ítem debe aparecer en kitchen como retenido (from_validation=false)
    const kitchenRes = await request.get('/api/waiter/kitchen/items', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(kitchenRes.status()).toBe(200);
    const kitchenBody = await kitchenRes.json() as { items: Array<{ pedidoId: string; itemIdx: number; estado: string }> };
    const inKitchen = kitchenBody.items.find(
      i => i.pedidoId === pedidoValidatedPausedId && i.itemIdx === 0
    );
    // Si falla aquí → upsertItemEstado no escribe from_validation=false correctamente,
    // o el item no aparece en kitchen como retenido.
    expect(inKitchen).toBeDefined();
    expect(inKitchen?.estado).toBe('retenido');

    // Ítem NO debe aparecer en pendientes (from_validation=false excluye de la vista)
    const pendientesRes = await request.get('/api/waiter/pendientes/orders', {
      headers: { cookie: `waiter_token=${sessionWaiterToken}` },
    });
    expect(pendientesRes.status()).toBe(200);
    const pendientesBody = await pendientesRes.json() as {
      mesas: Array<{ pedidos: Array<{ id: string }> }>;
    };
    const allPedidos = pendientesBody.mesas.flatMap(m => m.pedidos);
    const inPendientes = allPedidos.find(p => p.id === pedidoValidatedPausedId);
    // Si falla aquí → el ítem con from_validation=false está siendo mostrado en pendientes
    // cuando solo deben mostrarse los from_validation=true.
    expect(inPendientes).toBeUndefined();
  });
});
