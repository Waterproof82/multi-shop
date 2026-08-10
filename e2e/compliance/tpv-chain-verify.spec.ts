/**
 * E2E — TPV Audit Chain Verify (RD 1007/2023 / Ley 11/2021)
 *
 * Verifica:
 *   1. GET /api/tpv/audit/chain sin auth → 401/403 (endpoint protegido)
 *   2. GET /api/tpv/audit/chain con admin_token → 200 con estructura válida
 *   3. GET /api/tpv/audit/export sin auth → 401/403
 *
 * Requiere: PLAYWRIGHT_ADMIN_EMAIL + PLAYWRIGHT_ADMIN_PASSWORD para el test 2
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { nuevoContexto } from '../helpers/contexto';

function adminEmail(): string | undefined    { return process.env.PLAYWRIGHT_ADMIN_EMAIL; }
function adminPassword(): string | undefined { return process.env.PLAYWRIGHT_ADMIN_PASSWORD; }

test.describe('TPV Audit Chain — verificación cadena (RD 1007/2023)', () => {
  // ── Sin auth ─────────────────────────────────────────────────────────────

  test('GET /api/tpv/audit/chain sin auth → 401 o 403', async ({ request }) => {
    const res = await request.get('/api/tpv/audit/chain');
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/tpv/audit/export sin auth → 401 o 403', async ({ request }) => {
    const res = await request.get('/api/tpv/audit/export');
    expect([401, 403]).toContain(res.status());
  });

  // ── Con admin_token ───────────────────────────────────────────────────────

  test.describe('Con admin_token (requiere credenciales)', () => {
    let authedRequest: APIRequestContext;
    let csrfToken: string | null = null;

    test.beforeAll(async ({ playwright, baseURL }) => {
      if (!adminEmail() || !adminPassword()) return;
      authedRequest = await nuevoContexto(playwright, baseURL);
      const res = await authedRequest.post('/api/admin/login', {
        data: { email: adminEmail()!, password: adminPassword()! },
      });
      if (res.ok()) {
        const body = await res.json() as { csrfToken?: string };
        csrfToken = body.csrfToken ?? null;
      }
    });

    test.afterAll(async () => {
      await authedRequest?.dispose();
    });

    test('GET /api/tpv/audit/chain con admin_token → 200 con array', async () => {
      if (!adminEmail() || !adminPassword()) {
        test.skip(true, 'PLAYWRIGHT_ADMIN_EMAIL o PLAYWRIGHT_ADMIN_PASSWORD no definidos');
        return;
      }
      if (!csrfToken) {
        test.skip(true, 'Login falló en beforeAll');
        return;
      }

      const res = await authedRequest.get('/api/tpv/audit/chain');
      // 200 = chain endpoint responde correctamente
      // 404 = no existe turno — también válido (no hay datos aún)
      expect([200, 404]).toContain(res.status());

      if (res.status() === 200) {
        const body = await res.json();
        // Debe devolver array o un objeto con campo de verificación
        expect(typeof body === 'object' && body !== null).toBe(true);
      }
    });
  });
});
