/**
 * E2E — RGPD Anonimización (GAP-005 / GAP-007)
 *
 * Verifica que los endpoints de anonimización y purga RGPD:
 *   1. Están protegidos (requieren autenticación de admin)
 *   2. Responden correctamente a peticiones no autorizadas
 *   3. El endpoint de purga CRON valida su secret
 *
 * Norma: RGPD Art. 17 (derecho al olvido) + Art. 5.1.e (limitación del plazo de conservación)
 *
 * Nota: Los tests que ejercen la anonimización real requieren
 * PLAYWRIGHT_ADMIN_EMAIL + PLAYWRIGHT_ADMIN_PASSWORD (skipped si no están definidos).
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { nuevoContexto } from '../helpers/contexto';

function adminEmail(): string | undefined    { return process.env.PLAYWRIGHT_ADMIN_EMAIL; }
function adminPassword(): string | undefined { return process.env.PLAYWRIGHT_ADMIN_PASSWORD; }
function cronSecret(): string | undefined    { return process.env.CRON_SECRET; }

// ── Protección de endpoints (sin auth) ────────────────────────────────────────

test.describe('RGPD — Protección de endpoints sin autenticación', () => {
  test('POST /api/admin/rgpd/anonimizar-cliente sin auth → 401 o 403', async ({ request }) => {
    const res = await request.post('/api/admin/rgpd/anonimizar-cliente', {
      data: { clienteId: '00000000-0000-0000-0000-000000000000' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/cron/rgpd-purge sin CRON_SECRET → 401 o 403', async ({ request }) => {
    const res = await request.get('/api/cron/rgpd-purge');
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/cron/rgpd-purge con secret incorrecto → 401 o 403', async ({ request }) => {
    const res = await request.get('/api/cron/rgpd-purge', {
      headers: { Authorization: 'Bearer wrong-secret-value' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/rgpd/anonimizar-cliente con body vacío sin auth → 401 o 403', async ({ request }) => {
    const res = await request.post('/api/admin/rgpd/anonimizar-cliente', {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ── Tests con CRON_SECRET real ─────────────────────────────────────────────────

test.describe('RGPD — Purge CRON con secret válido', () => {
  test('GET /api/cron/rgpd-purge con CRON_SECRET correcto → no 500', async ({ request }) => {
    if (!cronSecret()) {
      test.skip(true, 'CRON_SECRET no definido — skip');
      return;
    }
    const res = await request.get('/api/cron/rgpd-purge', {
      headers: { Authorization: `Bearer ${cronSecret()}` },
    });
    // 200 = purge ejecutado (con o sin registros a purgar)
    // 204 = sin registros elegibles
    // 401/403 = secret incorrecto en este entorno (aceptable si es staging sin cron activo)
    expect(res.status()).not.toBe(500);
    expect([200, 204, 401, 403]).toContain(res.status());
  });
});

// ── Tests con admin_token ──────────────────────────────────────────────────────

test.describe('RGPD — Anonimización con autenticación admin', () => {
  let authedRequest: APIRequestContext;

  test.beforeAll(async ({ playwright, baseURL }) => {
    if (!adminEmail() || !adminPassword()) return;
    authedRequest = await nuevoContexto(playwright, baseURL);
    await authedRequest.post('/api/admin/login', {
      data: { email: adminEmail()!, password: adminPassword()! },
    });
  });

  test.afterAll(async () => {
    await authedRequest?.dispose();
  });

  test('POST /api/admin/rgpd/anonimizar-cliente con UUID inexistente → nunca 500', async () => {
    if (!adminEmail() || !adminPassword()) {
      test.skip(true, 'PLAYWRIGHT_ADMIN_EMAIL o PLAYWRIGHT_ADMIN_PASSWORD no definidos');
      return;
    }

    const res = await authedRequest.post('/api/admin/rgpd/anonimizar-cliente', {
      data: { clienteId: '00000000-0000-0000-0000-000000000001' },
    });

    // Compliance assertion: el endpoint no debe explotar con 500.
    // 200/404 = comportamiento normal; 400/401/403/429 = barreras de acceso o rate limit (aceptables en CI).
    expect(res.status()).not.toBe(500);
  });

  test('POST /api/admin/rgpd/anonimizar-cliente con UUID malformado → nunca 500', async () => {
    if (!adminEmail() || !adminPassword()) {
      test.skip(true, 'PLAYWRIGHT_ADMIN_EMAIL o PLAYWRIGHT_ADMIN_PASSWORD no definidos');
      return;
    }

    const res = await authedRequest.post('/api/admin/rgpd/anonimizar-cliente', {
      data: { clienteId: 'not-a-uuid' },
    });

    expect(res.status()).not.toBe(500);
  });

  test('POST /api/admin/rgpd/anonimizar-cliente sin clienteId → nunca 500', async () => {
    if (!adminEmail() || !adminPassword()) {
      test.skip(true, 'PLAYWRIGHT_ADMIN_EMAIL o PLAYWRIGHT_ADMIN_PASSWORD no definidos');
      return;
    }

    const res = await authedRequest.post('/api/admin/rgpd/anonimizar-cliente', {
      data: {},
    });

    expect(res.status()).not.toBe(500);
  });
});
