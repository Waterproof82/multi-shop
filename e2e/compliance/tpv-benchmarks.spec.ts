/**
 * E2E — TPV Benchmarks (performance baseline)
 *
 * Verifica que las rutas críticas responden dentro de umbrales aceptables
 * bajo carga mínima (no un benchmark de 10.000 ventas — fuera de scope).
 *
 * Mide:
 *   1. GET /api/tpv/audit/chain → < 2000ms
 *   2. GET /api/tpv/audit/export → < 3000ms
 *   3. POST /api/tpv/cobro (sin auth) → < 500ms (auth check rápido)
 *
 * Nota: Los tiempos incluyen el round-trip. En CI pueden ser más altos.
 */
import { test, expect } from '@playwright/test';

test.describe('TPV Benchmarks — tiempos de respuesta (baseline)', () => {
  test('GET /api/tpv/audit/chain responde < 2000ms', async ({ request }) => {
    const start = Date.now();
    const res = await request.get('/api/tpv/audit/chain');
    const elapsed = Date.now() - start;

    // El status importa menos — interesa que no sea 500 y sea rápido
    expect(res.status()).not.toBe(500);
    expect(elapsed).toBeLessThan(2000);
  });

  test('GET /api/tpv/audit/export responde < 3000ms', async ({ request }) => {
    const start = Date.now();
    const res = await request.get('/api/tpv/audit/export');
    const elapsed = Date.now() - start;

    expect(res.status()).not.toBe(500);
    expect(elapsed).toBeLessThan(3000);
  });

  test('POST /api/tpv/cobro sin auth responde < 500ms (auth barrier rápido)', async ({ request }) => {
    const start = Date.now();
    const res = await request.post('/api/tpv/cobro', {
      data: {
        turnoId: '00000000-0000-0000-0000-000000000099',
        pedidoId: '00000000-0000-0000-0000-000000000099',
        metodoPago: 'efectivo',
      },
    });
    const elapsed = Date.now() - start;

    // El auth check debe ser inmediato — si tarda > 500ms podría indicar
    // que la DB está siendo invocada antes del auth check
    expect([400, 401, 403]).toContain(res.status());
    expect(elapsed).toBeLessThan(500);
  });

  test('10 requests consecutivos a /api/tpv/audit/chain → ninguno con 500', async ({ request }) => {
    for (let i = 0; i < 10; i++) {
      const res = await request.get('/api/tpv/audit/chain');
      expect(res.status()).not.toBe(500);
    }
  });
});
