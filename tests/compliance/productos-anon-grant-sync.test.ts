/**
 * Chequeo estático: la lista de columnas que `anon` puede leer de
 * public.productos (20261110000002_restrict_productos_anon_columns.sql) debe
 * coincidir EXACTAMENTE con la que lee el storefront público
 * (PRODUCT_PUBLIC_COLUMNS en SupabaseProductRepository.findAllByTenantQuery).
 *
 * - Columna en el código y no en el GRANT → el catálogo público de TODOS los
 *   tenants falla con "permission denied".
 * - Columna en el GRANT y no en el código → se expone sin necesidad.
 *
 * Una columna nueva en productos queda oculta para anon por defecto: para
 * mostrarla hay que añadirla en el código Y en una migración de GRANT nueva
 * (y actualizar aquí la ruta de la migración vigente).
 * Mismo patrón que productos-slug-historial-migration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const MIGRACION = readFileSync(
  join(ROOT, 'supabase/migrations/20261110000002_restrict_productos_anon_columns.sql'),
  'utf8',
);
const REPOSITORIO = readFileSync(
  join(ROOT, 'src/core/infrastructure/database/SupabaseProductRepository.ts'),
  'utf8',
);

function parseColumns(list: string): string[] {
  return list
    .split(',')
    .map((column) => column.trim())
    .filter((column) => column.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function grantedColumns(): string[] {
  const match = /GRANT SELECT \(([^)]+)\) ON public\.productos TO anon/.exec(MIGRACION);
  if (match === null) throw new Error('GRANT SELECT (...) ON public.productos TO anon no encontrado');
  return parseColumns(match[1]);
}

function storefrontColumns(): string[] {
  const match = /const PRODUCT_PUBLIC_COLUMNS =\s*"([^"]+)"/.exec(REPOSITORIO);
  if (match === null) throw new Error('PRODUCT_PUBLIC_COLUMNS no encontrado');
  return parseColumns(match[1]);
}

describe('productos — GRANT de anon sincronizado con el storefront', () => {
  it('revoca primero el SELECT de tabla completa a anon', () => {
    expect(MIGRACION).toMatch(/REVOKE SELECT ON public\.productos FROM anon;/);
  });

  it('concede a anon exactamente las columnas que lee el storefront', () => {
    expect(grantedColumns()).toEqual(storefrontColumns());
  });
});
