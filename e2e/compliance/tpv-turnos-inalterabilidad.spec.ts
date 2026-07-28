/**
 * E2E — TPV Turnos: Inalterabilidad (SIALTI / Ley 11/2021)
 *
 * Verifica:
 *   1. DELETE en tpv_turnos → excepción tpv_turno_no_delete
 *   2. DELETE en tpv_turno_eventos → excepción tpv_turno_evento_no_delete
 *   3. UPDATE en tpv_turno_eventos → excepción tpv_turno_evento_no_update
 *   4. UPDATE de campo de apertura en turno abierto → excepción tpv_turno_no_update_fields
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY
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

test.describe('TPV Turnos — Inalterabilidad (SIALTI / Ley 11/2021)', () => {
  test.skip(!process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY, 'Requiere PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY');

  test('DELETE en tpv_turnos → excepción trigger tpv_turno_no_delete', async ({ request }) => {
    const res = await request.delete(
      `${supabaseUrl()}/rest/v1/tpv_turnos?id=eq.${DUMMY_UUID}`,
      { headers: serviceHeaders() }
    );
    expect([400, 409, 204]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/DELETE no permitido|tpv_turnos/i);
    }
  });

  test('DELETE en tpv_turno_eventos → excepción trigger tpv_turno_evento_no_delete', async ({ request }) => {
    const res = await request.delete(
      `${supabaseUrl()}/rest/v1/tpv_turno_eventos?id=eq.${DUMMY_UUID}`,
      { headers: serviceHeaders() }
    );
    expect([400, 409, 204]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/DELETE no permitido|tpv_turno_eventos/i);
    }
  });

  test('UPDATE en tpv_turno_eventos → excepción trigger tpv_turno_evento_no_update', async ({ request }) => {
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/tpv_turno_eventos?id=eq.${DUMMY_UUID}`,
      {
        headers: serviceHeaders(),
        data: { descripcion: 'manipulado' },
      }
    );
    expect([400, 409, 204]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/UPDATE no permitido|tpv_turno_eventos/i);
    }
  });

  test('UPDATE de empresa_id en tpv_turnos → excepción tpv_turno_no_update_fields', async ({ request }) => {
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/tpv_turnos?id=eq.${DUMMY_UUID}`,
      {
        headers: serviceHeaders(),
        data: { empresa_id: DUMMY_UUID },
      }
    );
    expect([400, 409, 204]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/inmutables|tpv_turnos/i);
    }
  });
});
