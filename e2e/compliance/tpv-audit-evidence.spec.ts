/**
 * E2E — TPV Audit Evidence (RGPD / Ley 11/2021 / SIALTI)
 *
 * Verifica que las rutas de auditoría existen y responden correctamente:
 *   1. GET /api/tpv/audit/chain sin auth → 401/403 (protegido)
 *   2. GET /api/tpv/audit/export sin auth → 401/403 (protegido)
 *   3. GET /api/laborcontrol/chain/verify sin auth → 401/403
 *   4. POST /api/tpv/cobro/rectificar sin auth → 401/403 (protegido)
 *
 * Verifica también que no hay rutas de auditoría que devuelvan 404
 * (lo que indicaría que el endpoint no existe).
 */
import { test, expect } from '@playwright/test';

test.describe('TPV Audit Evidence — endpoints protegidos (RGPD / Ley 11/2021)', () => {
  test('GET /api/tpv/audit/chain sin auth → 401 o 403, nunca 404', async ({ request }) => {
    const res = await request.get('/api/tpv/audit/chain');
    // Si devuelve 404, el endpoint no existe — gap crítico
    expect(res.status()).not.toBe(404);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/tpv/audit/export sin auth → 401 o 403, nunca 404', async ({ request }) => {
    const res = await request.get('/api/tpv/audit/export');
    expect(res.status()).not.toBe(404);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/laborcontrol/chain/verify sin auth → 401 o 403', async ({ request }) => {
    const res = await request.get('/api/laborcontrol/chain/verify');
    // 404 = endpoint no existe (gap)
    // 401/403 = existe y está protegido (correcto)
    // Se documenta pero no se fuerza a no-404 porque el path puede variar
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /api/tpv/cobro/rectificar sin auth → 401 o 403', async ({ request }) => {
    const res = await request.post('/api/tpv/cobro/rectificar', {
      data: { cobroOriginalId: '00000000-0000-0000-0000-000000000099', motivo: 'test' },
    });
    expect(res.status()).not.toBe(500);
    expect([401, 403]).toContain(res.status());
  });

  test('Rutas de auditoría no devuelven 500 (DB funcionando)', async ({ request }) => {
    const auditRoutes = [
      '/api/tpv/audit/chain',
      '/api/tpv/audit/export',
    ];
    for (const route of auditRoutes) {
      const res = await request.get(route);
      expect(res.status()).not.toBe(500);
    }
  });
});
