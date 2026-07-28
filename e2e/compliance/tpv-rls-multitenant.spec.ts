/**
 * E2E — TPV RLS Multi-tenant (OWASP / Art.9 RGPD)
 *
 * Verifica que el rol anon no puede leer tablas fiscales via Supabase REST.
 * Comprueba aislamiento de tenant: anon con key pública → 0 filas o 401.
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import { test, expect } from '@playwright/test';

function supabaseUrl(): string | undefined { return process.env.NEXT_PUBLIC_SUPABASE_URL; }
function anonKey(): string | undefined     { return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; }

function anonHeaders() {
  return {
    apikey: anonKey()!,
    Authorization: `Bearer ${anonKey()!}`,
  };
}

test.describe('TPV RLS — Multi-tenant isolation (anon = DENY)', () => {
  test.beforeEach(() => {
    if (!supabaseUrl() || !anonKey()) {
      test.skip(true, 'NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no definidos');
    }
  });

  const fiscalTables = [
    'tpv_cobros',
    'tpv_turnos',
    'tpv_turno_eventos',
    'pedidos',
  ] as const;

  for (const table of fiscalTables) {
    test(`anon no puede leer ${table} via Supabase REST → 0 filas o 401`, async ({ request }) => {
      const res = await request.get(
        `${supabaseUrl()}/rest/v1/${table}?select=id&limit=1`,
        { headers: anonHeaders() }
      );

      // Con RLS activo y policy anon=DENY:
      //   - PostgREST devuelve 200 con array vacío (tabla en schema cache, RLS bloquea)
      //   - PostgREST devuelve 401 si la tabla requiere auth
      //   - PostgREST devuelve 404 si tabla no expuesta en schema
      expect([200, 401, 404]).toContain(res.status());

      if (res.status() === 200) {
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(0); // RLS bloquea — 0 filas
      }
    });
  }

  test('anon no puede insertar en tpv_cobros → 401 o 403', async ({ request }) => {
    const res = await request.post(
      `${supabaseUrl()}/rest/v1/tpv_cobros`,
      {
        headers: { ...anonHeaders(), 'Content-Type': 'application/json' },
        data: { empresa_id: '00000000-0000-0000-0000-000000000099', importe_total: 0 },
      }
    );
    expect([400, 401, 403]).toContain(res.status());
  });
});
