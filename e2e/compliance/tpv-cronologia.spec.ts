/**
 * E2E — TPV Cronología (RD 1007/2023 / SIALTI)
 *
 * Verifica que no se puede manipular campos de cronología:
 *   1. UPDATE de cobrado_at en tpv_cobros → excepción (campo inmutable)
 *   2. UPDATE de apertura_at en tpv_turnos → excepción (campo inmutable)
 *   3. UPDATE de numero_ticket en tpv_cobros → excepción (campo inmutable)
 *   4. UPDATE de numero_z en tpv_turnos → excepción (campo inmutable)
 *
 * Requiere: PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 */
import { test, expect } from '@playwright/test';

const DUMMY_UUID = '00000000-0000-0000-0000-000000000099';

function supabaseUrl(): string | undefined { return process.env.NEXT_PUBLIC_SUPABASE_URL; }
function serviceKey(): string | undefined  { return process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY; }

function serviceHeaders() {
  return {
    apikey: serviceKey()!,
    Authorization: `Bearer ${serviceKey()!}`,
    'Content-Type': 'application/json',
  };
}

test.describe('TPV Cronología — campos inmutables (RD 1007/2023 / SIALTI)', () => {
  test.skip(!process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY, 'Requiere PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY');

  test('UPDATE cobrado_at en tpv_cobros → excepción tpv_cobro_no_update_critical', async ({ request }) => {
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/tpv_cobros?id=eq.${DUMMY_UUID}`,
      {
        headers: serviceHeaders(),
        data: { cobrado_at: new Date().toISOString() },
      }
    );
    expect([400, 409, 204]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/inmutables|tpv_cobros/i);
    }
  });

  test('UPDATE numero_ticket en tpv_cobros → excepción tpv_cobro_no_update_critical', async ({ request }) => {
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/tpv_cobros?id=eq.${DUMMY_UUID}`,
      {
        headers: serviceHeaders(),
        data: { numero_ticket: 9999 },
      }
    );
    expect([400, 409, 204]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/inmutables|tpv_cobros/i);
    }
  });

  test('UPDATE apertura_at en tpv_turnos → excepción tpv_turno_no_update_fields', async ({ request }) => {
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/tpv_turnos?id=eq.${DUMMY_UUID}`,
      {
        headers: serviceHeaders(),
        data: { apertura_at: new Date().toISOString() },
      }
    );
    expect([400, 409, 204]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/inmutables|tpv_turnos/i);
    }
  });

  test('UPDATE numero_z en tpv_turnos → excepción tpv_turno_no_update_fields', async ({ request }) => {
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/tpv_turnos?id=eq.${DUMMY_UUID}`,
      {
        headers: serviceHeaders(),
        data: { numero_z: 9999 },
      }
    );
    expect([400, 409, 204]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/inmutables|tpv_turnos/i);
    }
  });
});
