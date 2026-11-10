/**
 * E2E — productos: anon must never be able to SELECT * (OWASP A01/A05,
 * same bug class as public.empresas).
 *
 * Historial: 20260527000000_explicit_grants_data_api.sql granted table-wide
 * SELECT on productos to anon, and the (pre-migrations) RLS policy
 * "Publico ve productos" is USING(true). None of the 26 current columns is
 * sensitive, but any column added later would silently inherit that grant —
 * exactly the bug fixed for public.empresas in
 * 20261110000001_restrict_empresas_secret_columns.sql.
 *
 * Fix (2026-11-10): 20261110000002_restrict_productos_anon_columns.sql —
 * column-level GRANT for anon, scoped to the columns the public storefront
 * actually reads (SupabaseProductRepository.findAllByTenantQuery, via
 * GetMenuUseCase).
 *
 * NOTA: este test corre contra la BD real (husky pre-push). Falla hasta que
 * la migración se aplique con `supabase db push --linked` — el owner la
 * aplica, no este commit.
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

// Columnas que el storefront público lee con el cliente anon
// (SupabaseProductRepository.findAllByTenantQuery, via GetMenuUseCase) —
// mismo conjunto que PRODUCT_PUBLIC_COLUMNS y la migración de esta PR.
const STOREFRONT_COLUMNS = [
  'id', 'empresa_id', 'categoria_id',
  'titulo_es', 'titulo_en', 'titulo_fr', 'titulo_it', 'titulo_de',
  'descripcion_es', 'descripcion_en', 'descripcion_fr', 'descripcion_it', 'descripcion_de',
  'precio', 'foto_url', 'foto_url_2', 'foto_object_fit',
  'es_especial', 'activo', 'tipo_producto', 'porcentaje_impuesto_override',
  'alergenos', 'tabla_info', 'created_at', 'slug', 'canonical_externo',
];

test.describe('productos — anon no puede hacer select=* (columnas no otorgadas)', () => {
  test.beforeEach(() => {
    test.skip(!supabaseUrl() || !anonKey(), 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
  });

  test('anon select=* is denied', async ({ request }) => {
    const res = await request.get(`${supabaseUrl()}/rest/v1/productos?select=*&limit=1`, {
      headers: anonHeaders(),
    });
    expect(res.ok()).toBe(false);
  });

  test('anon can still read the storefront column list', async ({ request }) => {
    const res = await request.get(
      `${supabaseUrl()}/rest/v1/productos?select=${STOREFRONT_COLUMNS.join(',')}&limit=1`,
      { headers: anonHeaders() },
    );
    expect(res.status()).toBe(200);
  });
});
