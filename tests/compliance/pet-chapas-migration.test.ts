/**
 * Chequeo estático de la migración `pet_chapas` (pet-id-qr-profile PR1): RLS
 * y los GRANT son la última barrera de aislamiento por tenant y de
 * minimización de PII (DD7 — `authenticated` no puede ver `pet_chapas`).
 * Ningún test de integración los cubre sin una base de datos real
 * (--linked), así que se comprueban sobre el SQL fuente — mismo patrón que
 * tests/compliance/productos-slug-historial-migration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MIGRACION = join(
  resolve(__dirname, '../..'),
  'supabase/migrations/20261120000001_pet_chapas.sql',
);

const sql = readFileSync(MIGRACION, 'utf8');

describe('migración pet_chapas — RLS y privilegios', () => {
  it('habilita RLS en las dos tablas', () => {
    expect(sql).toMatch(/ALTER TABLE public\.pet_chapa_lotes ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.pet_chapas ENABLE ROW LEVEL SECURITY/);
  });

  it('deniega a anon con una policy AS RESTRICTIVE en las dos tablas', () => {
    expect(sql).toMatch(
      /CREATE POLICY[^;]*ON public\.pet_chapa_lotes\s+AS RESTRICTIVE FOR ALL TO anon USING \(false\) WITH CHECK \(false\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY[^;]*ON public\.pet_chapas\s+AS RESTRICTIVE FOR ALL TO anon USING \(false\) WITH CHECK \(false\)/,
    );
  });

  it('nunca concede nada a anon en ninguna de las dos tablas (ningún TO anon fuera de la RESTRICTIVE)', () => {
    const grantsToAnon = sql.match(/GRANT[^;]*ON public\.pet_chapa(_lotes)?\s+TO\s+anon/g);
    expect(grantsToAnon).toBeNull();
  });

  it('pet_chapa_lotes: authenticated gestiona sus propios lotes por empresa_id', () => {
    expect(sql).toMatch(
      /CREATE POLICY[^;]*ON public\.pet_chapa_lotes\s+FOR SELECT TO authenticated USING \(empresa_id = \(SELECT private\.get_mi_empresa_id\(\)\)\)/,
    );
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.pet_chapa_lotes TO authenticated/);
  });

  it('DD7: pet_chapas no tiene ninguna policy ni GRANT para authenticated', () => {
    expect(sql).not.toMatch(/ON public\.pet_chapas[\s\S]{0,120}TO authenticated/);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pet_chapas TO authenticated/);
  });

  it('las dos tablas dan acceso completo solo a service_role', () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.pet_chapa_lotes TO service_role/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.pet_chapas TO service_role/);
  });

  it('el GRANT de la columna del flag del tenant es solo para authenticated, nunca anon', () => {
    expect(sql).toMatch(/GRANT SELECT \(pet_id_qr_habilitado\) ON public\.empresas TO authenticated/);
    expect(sql).not.toMatch(/GRANT SELECT \(pet_id_qr_habilitado\) ON public\.empresas TO anon/);
  });

  it('el código de la chapa exige el prefijo M, distinto del prefijo KEC de los kits', () => {
    expect(sql).toMatch(
      /codigo TEXT PRIMARY KEY CHECK \(codigo ~ '\^M-\[0-9A-HJKMNP-TV-Z\]\{4\}-\[0-9A-HJKMNP-TV-Z\]\{4\}-\[0-9A-HJKMNP-TV-Z\]\$'\)/,
    );
  });

  it('la función SECURITY DEFINER del trigger tiene el REVOKE completo y search_path blindado', () => {
    expect(sql).toMatch(/CREATE FUNCTION private\.pet_chapa_lotes_validar_producto\(\)/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.pet_chapa_lotes_validar_producto\(\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it('la FK compuesta liga pet_chapas al lote de la misma empresa', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \(lote_id, empresa_id\) REFERENCES public\.pet_chapa_lotes\(id, empresa_id\) ON DELETE RESTRICT/,
    );
  });
});
