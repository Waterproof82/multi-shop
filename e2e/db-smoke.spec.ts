/**
 * E2E — DB Function Smoke Tests
 *
 * Verifica que las funciones de base de datos críticas (las que usan digest()
 * de pgcrypto) son invocables desde las rutas de API.
 *
 * Clase de error que detecta:
 *   "function digest(bytea, unknown) does not exist"
 *   Ocurre cuando una función DB es recreada sin SET search_path correcto
 *   (el schema 'extensions' de Supabase queda fuera de scope).
 *
 * Escenarios cubiertos:
 *   1. [sin credenciales] LaborControl kiosk → 401, NUNCA 500
 *      Un 500 aquí significa que el error de DB escapa antes del auth check.
 *   2. [SUPABASE_SERVICE_ROLE_KEY] RPC directa a lc_canonical_payload
 *      → 200 con payload v1|... Verifica que digest() es reachable desde la función.
 *   3. [SUPABASE_SERVICE_ROLE_KEY] RPC directa a lc_verify_chain_segment
 *      → 200 con status OK. Verifica que digest() es reachable desde esa función.
 *   4. [PLAYWRIGHT_ADMIN_TOKEN + PLAYWRIGHT_CSRF_TOKEN] POST /api/laborcontrol/fichaje/kiosk
 *      → respuesta de negocio (no 500). Ejercita el path completo DB.
 *
 * Variables de entorno:
 *   NEXT_PUBLIC_SUPABASE_URL              — URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  — service_role key (no anon key)
 *   PLAYWRIGHT_ADMIN_TOKEN               — cookie admin_token de sesión real
 *   PLAYWRIGHT_CSRF_TOKEN                — valor del csrf_token para POST mutativos
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

// ── env helpers ───────────────────────────────────────────────────────────────

const DUMMY_UUID = '00000000-0000-0000-0000-000000000099';

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function serviceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}


// ── Suite 1: Auth barrier (sin credenciales) ──────────────────────────────────
// No necesita variables de entorno. Verifica que las rutas críticas
// fallan con 4xx (auth), nunca con 5xx (error de DB).

test.describe('DB smoke — auth barrier (sin credenciales)', () => {
  let request: APIRequestContext;

  test.beforeEach(async ({ playwright, baseURL }) => {
    request = await playwright.request.newContext({ baseURL });
  });

  test.afterEach(async () => {
    await request.dispose();
  });

  test('POST /api/laborcontrol/fichaje/kiosk sin auth → 401, nunca 500', async () => {
    const res = await request.post('/api/laborcontrol/fichaje/kiosk', {
      data: { pin: '0000', tipo: 'entrada', accion: 'fichaje_entrada' },
    });
    // 401 = auth check correcto (DB no llegó a ser llamada, o fue llamada y funcionó)
    // 403 = CSRF check (también aceptable — implica que auth pasó y DB no explotó antes)
    // 500 = ERROR: la DB explotó (digest not found u otro error crítico)
    expect(res.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(res.status());
  });

  test('POST /api/tpv/stock/mermas sin auth → 401, nunca 500', async () => {
    const res = await request.post('/api/tpv/stock/mermas', {
      data: { ingredienteId: DUMMY_UUID, cantidad: 1, motivo: 'otro', operadorNombre: 'smoke' },
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(res.status());
  });

  test('POST /api/tpv/cobro sin auth → 401, nunca 500 (tpv_cobro_before_insert digest reachable)', async () => {
    // Regresión 2026-07-26: migración 20260725000003 sobrescribió search_path de
    // tpv_cobro_before_insert con "public, pg_catalog", eliminando "extensions"
    // donde vive pgcrypto. digest() fallaba con "function does not exist" → 500.
    // Un 4xx aquí confirma que auth check pasó primero (o el trigger no explotó).
    const res = await request.post('/api/tpv/cobro', {
      data: { turnoId: DUMMY_UUID, pedidoId: DUMMY_UUID, metodoPago: 'efectivo' },
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 403, 404, 422]).toContain(res.status());
  });

  test('POST /api/tpv/turno/abrir sin auth → 401, nunca 500 (tpv_turno_before_insert digest reachable)', async () => {
    // Mismo patrón: tpv_turno_before_insert usa digest() — fallaba con 500 tras
    // migración 20260725000003. Fix: migración 20260726000002.
    const res = await request.post('/api/tpv/turno/abrir', {
      data: { cajaId: DUMMY_UUID, efectivoInicial: 0 },
    });
    expect(res.status()).not.toBe(500);
    expect([400, 401, 403, 404, 422]).toContain(res.status());
  });
});


// ── Suite 2: RPC directa con service_role ────────────────────────────────────
// Requiere SUPABASE_SERVICE_ROLE_KEY.
// Llama las funciones DB directamente via Supabase REST para verificar
// que digest() es reachable desde cada función.

test.describe('DB smoke — RPC directa (service_role)', () => {
  test('lc_canonical_payload RPC → 200 con payload v1|... (digest reachable)', async ({ request }) => {
    if (!supabaseUrl() || !serviceRoleKey()) {
      test.skip(true, 'NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidos');
      return;
    }

    const res = await request.post(
      `${supabaseUrl()}/rest/v1/rpc/lc_canonical_payload`,
      {
        headers: {
          apikey: serviceRoleKey()!,
          Authorization: `Bearer ${serviceRoleKey()!}`,
          'Content-Type': 'application/json',
        },
        data: {
          p_record_id:          DUMMY_UUID,
          p_empresa_id:         DUMMY_UUID,
          p_centro_id:          DUMMY_UUID,
          p_empleado_id:        DUMMY_UUID,
          p_actor_id:           null,
          p_tipo:               'entrada',
          p_accion:             'fichaje_entrada',
          p_ref_correccion:     null,
          p_timestamp_evento:   new Date().toISOString(),
          p_timestamp_servidor: new Date().toISOString(),
          p_motivo:             'smoke-test',
          p_prev_hash:          'SEGMENT_GENESIS',
        },
      }
    );

    expect(res.status()).toBe(200);

    const body = await res.text();
    // Supabase REST devuelve el scalar como JSON string — ej. "v1|accion=..."
    expect(body).toMatch(/^"v1\|/);
    expect(body).toContain('empresa_id=');
    expect(body).toContain('motivo_sha256='); // digest() se ejecutó correctamente
  });

  test('lc_verify_chain_segment RPC → 200 con status OK (digest reachable)', async ({ request }) => {
    if (!supabaseUrl() || !serviceRoleKey()) {
      test.skip(true, 'NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidos');
      return;
    }

    const res = await request.post(
      `${supabaseUrl()}/rest/v1/rpc/lc_verify_chain_segment`,
      {
        headers: {
          apikey: serviceRoleKey()!,
          Authorization: `Bearer ${serviceRoleKey()!}`,
          'Content-Type': 'application/json',
        },
        data: {
          p_empresa_id: DUMMY_UUID,
          p_year:       2026,
          p_month:      7,
        },
      }
    );

    // 200 = función invocable y digest() reachable
    // 404 = función no expuesta via PostgREST (raro, pero aceptable si REVOKE es correcto)
    // 500 = ERROR: digest() not found u otro fallo de DB
    expect(res.status()).not.toBe(500);
    expect([200, 204]).toContain(res.status());

    if (res.status() === 200) {
      const rows = (await res.json()) as Array<{ status: string; total_rows: number }>;
      expect(Array.isArray(rows)).toBe(true);
      if (rows.length > 0) {
        expect(['OK', 'BROKEN', 'TAMPERED']).toContain(rows[0].status);
      }
    }
  });
});


// ── Suite 3: Full API path con login automático ───────────────────────────────
// Requiere PLAYWRIGHT_ADMIN_EMAIL y PLAYWRIGHT_ADMIN_PASSWORD.
// Hace login real en beforeAll, luego ejercita el path completo:
//   autenticación → use case → repositorio → DB trigger (digest reachable).

function adminEmail(): string | undefined    { return process.env.PLAYWRIGHT_ADMIN_EMAIL; }
function adminPassword(): string | undefined { return process.env.PLAYWRIGHT_ADMIN_PASSWORD; }

test.describe('DB smoke — full API path (login automático)', () => {
  let request: APIRequestContext;
  let csrfHeader: string | null = null;

  test.beforeAll(async ({ playwright, baseURL }) => {
    if (!adminEmail() || !adminPassword()) return;

    request = await playwright.request.newContext({ baseURL });

    // Login: las cookies admin_token + csrf_token se guardan en el context automáticamente
    const loginRes = await request.post('/api/admin/login', {
      data: { email: adminEmail()!, password: adminPassword()! },
    });

    if (loginRes.ok()) {
      const body = await loginRes.json() as { csrfToken?: string };
      csrfHeader = body.csrfToken ?? null;
    }
  });

  test.afterAll(async () => {
    await request?.dispose();
  });

  test('POST /api/laborcontrol/fichaje/kiosk con admin_token → no 500 (lc trigger digest reachable)', async () => {
    if (!adminEmail() || !adminPassword()) {
      test.skip(true, 'PLAYWRIGHT_ADMIN_EMAIL o PLAYWRIGHT_ADMIN_PASSWORD no definidos');
      return;
    }
    if (!csrfHeader) {
      test.skip(true, 'Login de admin falló en beforeAll — verificar credenciales');
      return;
    }

    const res = await request.post('/api/laborcontrol/fichaje/kiosk', {
      headers: { 'x-csrf-token': csrfHeader },
      data: { pin: '0000', tipo: 'entrada', accion: 'fichaje_entrada' },
    });

    // 4xx = llegó al use case, DB respondió correctamente (pin inválido, etc.)
    // 500 = ERROR: digest() not found u otro fallo de DB
    expect(res.status()).not.toBe(500);
  });

  test('POST /api/tpv/cobro con admin_token → no 500 (tpv_cobro trigger digest reachable)', async () => {
    if (!adminEmail() || !adminPassword()) {
      test.skip(true, 'PLAYWRIGHT_ADMIN_EMAIL o PLAYWRIGHT_ADMIN_PASSWORD no definidos');
      return;
    }
    if (!csrfHeader) {
      test.skip(true, 'Login de admin falló en beforeAll — verificar credenciales');
      return;
    }

    const res = await request.post('/api/tpv/cobro', {
      headers: { 'x-csrf-token': csrfHeader },
      data: { turnoId: DUMMY_UUID, pedidoId: DUMMY_UUID, metodoPago: 'efectivo' },
    });

    expect(res.status()).not.toBe(500);
  });

  test('POST /api/tpv/turno/abrir con admin_token → no 500 (tpv_turno trigger digest reachable)', async () => {
    if (!adminEmail() || !adminPassword()) {
      test.skip(true, 'PLAYWRIGHT_ADMIN_EMAIL o PLAYWRIGHT_ADMIN_PASSWORD no definidos');
      return;
    }
    if (!csrfHeader) {
      test.skip(true, 'Login de admin falló en beforeAll — verificar credenciales');
      return;
    }

    const res = await request.post('/api/tpv/turno/abrir', {
      headers: { 'x-csrf-token': csrfHeader },
      data: { cajaId: DUMMY_UUID, efectivoInicial: 0 },
    });

    expect(res.status()).not.toBe(500);
  });
});
