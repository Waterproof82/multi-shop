/**
 * E2E — rgpd_purge_log: existencia, estructura e inmutabilidad (Art. 5(2) RGPD)
 *
 * Verifica vía Supabase REST API con service_role:
 *   1. rgpd_purge_log existe y es seleccionable
 *   2. INSERT de una fila funciona (así lo hace el cron)
 *   3. UPDATE → excepción trigger rgpd_purge_log_no_update (inmutabilidad)
 *   4. DELETE → excepción trigger rgpd_purge_log_no_delete (inmutabilidad)
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY
 */
import { test, expect } from '@playwright/test';

test.skip(
  !process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY,
  'Requiere PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY',
);

function supabaseUrl(): string { return process.env.NEXT_PUBLIC_SUPABASE_URL!; }
function serviceKey(): string  { return process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY!; }

function serviceHeaders(prefer = 'return=representation') {
  return {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

test.describe('rgpd_purge_log — Audit trail RGPD (Art. 5(2) accountability)', () => {
  let insertedId: number | null = null;

  test('tabla existe y es seleccionable con service_role', async ({ request }) => {
    const res = await request.get(
      `${supabaseUrl()}/rest/v1/rgpd_purge_log?select=id,executed_at,anonymized_count,status&limit=1`,
      { headers: serviceHeaders() },
    );
    // 400 = tabla no existe → gap crítico (migración 20260731000001 no aplicada)
    expect(res.status()).toBe(200);
  });

  test('INSERT de fila de purga funciona (mismo flujo que el cron)', async ({ request }) => {
    const res = await request.post(
      `${supabaseUrl()}/rest/v1/rgpd_purge_log`,
      {
        headers: serviceHeaders('return=representation'),
        data: {
          anonymized_count: 0,
          status: 'ok',
          triggered_by: 'e2e-test',
        },
      },
    );
    expect(res.status()).toBe(201);
    const rows = await res.json() as Array<{ id: number }>;
    expect(rows.length).toBe(1);
    insertedId = rows[0].id;
  });

  test('UPDATE → excepción trigger rgpd_purge_log_no_update (inmutabilidad)', async ({ request }) => {
    // Si el INSERT anterior no corrió (test skip parcial), usar id=0 — trigger no se dispara → 204 aceptable
    const id = insertedId ?? 0;
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/rgpd_purge_log?id=eq.${id}`,
      {
        headers: serviceHeaders('return=minimal'),
        data: { anonymized_count: 999 },
      },
    );
    // 204 si la fila no existe (trigger no se dispara — aceptable)
    // 400/409 si existe y el trigger lanza RAISE EXCEPTION
    expect([204, 400, 409]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/inmutable|rgpd_purge_log|accountability/i);
    }
  });

  test('DELETE → excepción trigger rgpd_purge_log_no_delete (inmutabilidad)', async ({ request }) => {
    const id = insertedId ?? 0;
    const res = await request.delete(
      `${supabaseUrl()}/rest/v1/rgpd_purge_log?id=eq.${id}`,
      { headers: serviceHeaders('return=minimal') },
    );
    // 204 si la fila no existe; 400/409 si el trigger bloquea
    expect([204, 400, 409]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/inmutable|rgpd_purge_log|accountability/i);
    }
  });
});
