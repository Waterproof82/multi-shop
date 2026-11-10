/**
 * E2E — empresas: tenant secrets must never be readable with the anon key
 * (OWASP A01/A02, PCI DSS 3.x for the Redsys merchant key).
 *
 * Historial: 20260527000000_explicit_grants_data_api.sql granted table-wide
 * SELECT on empresas to anon, and the RLS policy "Publico ve empresas" is
 * USING(true). Columns added later (redsys_*, glovo_*, waiter_pin_hash)
 * inherited that grant, so `GET /rest/v1/empresas?select=redsys_secret_key`
 * returned every tenant's secret.
 *
 * Fix (2026-11-10): 20261110000001_restrict_empresas_secret_columns.sql —
 * column-level GRANT for anon (storefront columns only) and authenticated
 * (everything except the secrets).
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

const SECRET_COLUMNS = [
  'redsys_secret_key',
  'redsys_merchant_code',
  'redsys_terminal',
  'glovo_private_key',
  'glovo_client_id',
  'glovo_key_id',
  'glovo_vendor_id',
  'waiter_pin_hash',
];

// Columns the public storefront reads with the anon client
// (SupabaseEmpresaRepository: getById, findByDomain, PUBLIC_SELECT).
const STOREFRONT_COLUMNS = ['id', 'nombre', 'dominio', 'slug', 'subdomain_pedidos', 'color_primary', 'nif', 'razon_social'];

test.describe('empresas — anon cannot read tenant secrets', () => {
  test.beforeEach(() => {
    test.skip(!supabaseUrl() || !anonKey(), 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
  });

  for (const column of SECRET_COLUMNS) {
    test(`anon select=${column} is denied`, async ({ request }) => {
      const res = await request.get(`${supabaseUrl()}/rest/v1/empresas?select=${column}&limit=1`, {
        headers: anonHeaders(),
      });
      expect(res.ok()).toBe(false);
    });
  }

  test('anon select=* is denied', async ({ request }) => {
    const res = await request.get(`${supabaseUrl()}/rest/v1/empresas?select=*&limit=1`, {
      headers: anonHeaders(),
    });
    expect(res.ok()).toBe(false);
  });

  test('anon can still read the storefront columns', async ({ request }) => {
    const res = await request.get(
      `${supabaseUrl()}/rest/v1/empresas?select=${STOREFRONT_COLUMNS.join(',')}&limit=1`,
      { headers: anonHeaders() },
    );
    expect(res.status()).toBe(200);
  });
});
