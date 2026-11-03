/**
 * Chequeo estático de la migración de histórico de slugs (product-detail-pages
 * PR5): RLS y los REVOKE de la función SECURITY DEFINER son la última
 * barrera de aislamiento por tenant. Ningún test de integración los cubre
 * sin una base de datos real (--linked), así que se comprueban sobre el
 * SQL fuente — mismo patrón que tests/compliance/mesa-sesion-channel.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MIGRACION = join(
  resolve(__dirname, '../..'),
  'supabase/migrations/20261103000002_productos_slug_historial.sql',
);

const sql = readFileSync(MIGRACION, 'utf8');

describe('migración productos_slug_historial — RLS y privilegios', () => {
  it('habilita RLS en la tabla', () => {
    expect(sql).toMatch(/ALTER TABLE public\.productos_slug_historial ENABLE ROW LEVEL SECURITY/);
  });

  it('deniega a anon con una policy AS RESTRICTIVE', () => {
    expect(sql).toMatch(
      /CREATE POLICY[^;]*ON public\.productos_slug_historial AS RESTRICTIVE FOR ALL TO anon\s+USING \(false\) WITH CHECK \(false\)/,
    );
  });

  it('authenticated solo puede SELECT, scoped a su propio empresa_id', () => {
    expect(sql).toMatch(
      /CREATE POLICY[^;]*ON public\.productos_slug_historial FOR SELECT TO authenticated\s+USING \(empresa_id = \(SELECT private\.get_mi_empresa_id\(\)\)\)/,
    );
    // Nunca una policy de INSERT/UPDATE/DELETE para authenticated: la
    // escritura es exclusiva del trigger (SECURITY DEFINER).
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE) TO authenticated/);
  });

  it('revoca todo a PUBLIC/anon y da ALL solo a service_role', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.productos_slug_historial FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON public\.productos_slug_historial FROM anon/);
    expect(sql).toMatch(/GRANT ALL ON public\.productos_slug_historial TO service_role/);
    expect(sql).toMatch(/GRANT SELECT ON public\.productos_slug_historial TO authenticated/);
  });

  it('la función SECURITY DEFINER del trigger tiene el REVOKE completo y search_path blindado', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION private\.registrar_slug_historico\(\)/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION private\.registrar_slug_historico\(\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION private\.registrar_slug_historico\(\) FROM anon/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION private\.registrar_slug_historico\(\) FROM authenticated/);
    expect(sql).toMatch(/GRANT {2}EXECUTE ON FUNCTION private\.registrar_slug_historico\(\) TO service_role/);
  });

  it('el trigger solo dispara cuando el slug realmente cambia', () => {
    expect(sql).toMatch(/AFTER UPDATE OF slug ON public\.productos/);
    expect(sql).toMatch(/WHEN \(OLD\.slug IS DISTINCT FROM NEW\.slug\)/);
  });
});
