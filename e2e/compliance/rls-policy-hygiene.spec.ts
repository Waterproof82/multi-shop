/**
 * E2E — RLS Policy Hygiene audit (OWASP A01 / RGPD Art.5-32)
 *
 * Historial (2026-07-31): dos incidentes de fuga de datos cross-tenant
 * compartieron la misma causa raíz estructural, no solo un policy puntual mal
 * escrito:
 *
 *   1. pedidos / mesa_sesiones / pedido_item_estados tenían un "No direct
 *      anon access" PERMISSIVE (no RESTRICTIVE). Las policies permisivas se
 *      combinan con OR, así que una policy `USING (true)` añadida después
 *      (para Realtime) anuló silenciosamente la denegación y expuso las 3
 *      tablas enteras via REST con solo la anon key pública.
 *   2. categorias/clientes/empresas/mesas/pedidos/productos tenían policies
 *      "Admin ..." con `roles: public` (incluye anon) cuyo USING/WITH CHECK
 *      llama a get_mi_empresa_id() — función que solo `authenticated` puede
 *      ejecutar. Esto no filtraba datos, pero lanzaba un error crudo de
 *      Postgres en vez de una denegación limpia en cuanto anon se volvía
 *      elegible para evaluar esa policy. Además, `clientes` tenía una policy
 *      adicional totalmente permisiva ("Public can select idioma",
 *      USING(true), sin scope de tenant) que sí exponía PII real a cualquier
 *      sesión `authenticated` de cualquier empresa.
 *
 * Fix: 20260731000002-000008 — restringió columnas, migró Realtime a
 * Broadcast, re-escopeó todas las policies "Admin ..." a `authenticated`, y
 * convirtió las 46 policies "no access" restantes de PERMISSIVE a
 * RESTRICTIVE (defensa en profundidad: una policy RESTRICTIVE nunca puede ser
 * anulada por una policy permisiva añadida después, sin importar cuán mal
 * escrita esté).
 *
 * Este test corre el escaneo completo de pg_policies (via
 * check_rls_policy_hygiene(), función SECURITY DEFINER solo accesible con
 * service_role) y falla si CUALQUIER tabla del schema reintroduce alguno de
 * estos dos patrones, o si alguna tabla pierde RLS por completo.
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY
 * (o SUPABASE_SERVICE_ROLE_KEY)
 */
import { test, expect } from '@playwright/test';

function supabaseUrl(): string | undefined { return process.env.NEXT_PUBLIC_SUPABASE_URL; }
function serviceRoleKey(): string | undefined {
  return process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}
function anonKey(): string | undefined { return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; }

interface HygieneViolation {
  check_name: 'permissive_anon_deny' | 'public_role_identity_scoped_fn' | 'rls_disabled';
  tablename: string;
  policyname: string | null;
  detail: string;
}

test.describe('RLS Policy Hygiene — escaneo completo del schema (service_role)', () => {
  test.beforeEach(() => {
    if (!supabaseUrl() || !serviceRoleKey()) {
      test.skip(true, 'NEXT_PUBLIC_SUPABASE_URL o PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY no definidos');
    }
  });

  test('ninguna tabla tiene un "no anon access" PERMISSIVE (debe ser RESTRICTIVE)', async ({ request }) => {
    const res = await request.post(`${supabaseUrl()}/rest/v1/rpc/check_rls_policy_hygiene`, {
      headers: {
        apikey: serviceRoleKey()!,
        Authorization: `Bearer ${serviceRoleKey()!}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    if (res.status() === 404) {
      test.skip(true, 'check_rls_policy_hygiene RPC no existe — ver 20260731000009_rls_policy_hygiene_audit_fn.sql');
      return;
    }

    expect(res.status()).toBe(200);
    const rows = (await res.json()) as HygieneViolation[];
    const violations = rows.filter(r => r.check_name === 'permissive_anon_deny');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename}.${v.policyname} (${v.detail})`).join('\n');
      throw new Error(
        `SEGURIDAD: policies "no anon access" PERMISSIVE en vez de RESTRICTIVE:\n${list}\n\n` +
          `Convertir con:\n` +
          `  DROP POLICY IF EXISTS "<nombre>" ON public.<tabla>;\n` +
          `  CREATE POLICY "<nombre>" ON public.<tabla> AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('ninguna policy roles:public referencia get_mi_empresa_id() o auth.uid() (debe ser TO authenticated)', async ({ request }) => {
    const res = await request.post(`${supabaseUrl()}/rest/v1/rpc/check_rls_policy_hygiene`, {
      headers: {
        apikey: serviceRoleKey()!,
        Authorization: `Bearer ${serviceRoleKey()!}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    if (res.status() === 404) {
      test.skip(true, 'check_rls_policy_hygiene RPC no existe');
      return;
    }

    expect(res.status()).toBe(200);
    const rows = (await res.json()) as HygieneViolation[];
    const violations = rows.filter(r => r.check_name === 'public_role_identity_scoped_fn');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename}.${v.policyname} (${v.detail})`).join('\n');
      throw new Error(
        `SEGURIDAD: policies con roles:public que llaman get_mi_empresa_id()/auth.uid() (funciones scopeadas a identidad, sin sentido para anon):\n${list}\n\n` +
          `Recrear la policy con TO authenticated en vez de public.`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('ninguna tabla del schema public tiene RLS deshabilitado', async ({ request }) => {
    const res = await request.post(`${supabaseUrl()}/rest/v1/rpc/check_rls_policy_hygiene`, {
      headers: {
        apikey: serviceRoleKey()!,
        Authorization: `Bearer ${serviceRoleKey()!}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    if (res.status() === 404) {
      test.skip(true, 'check_rls_policy_hygiene RPC no existe');
      return;
    }

    expect(res.status()).toBe(200);
    const rows = (await res.json()) as HygieneViolation[];
    const violations = rows.filter(r => r.check_name === 'rls_disabled');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename}`).join('\n');
      throw new Error(`SEGURIDAD: tablas sin RLS habilitado:\n${list}\n\nAplicar: ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;`);
    }
    expect(violations).toHaveLength(0);
  });

  test('check_rls_policy_hygiene() no es callable por anon', async ({ request }) => {
    if (!anonKey()) test.skip(true, 'NEXT_PUBLIC_SUPABASE_ANON_KEY no definida');

    const res = await request.post(`${supabaseUrl()}/rest/v1/rpc/check_rls_policy_hygiene`, {
      headers: {
        apikey: anonKey()!,
        Authorization: `Bearer ${anonKey()!}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    // 200 = FALLO CRÍTICO: la propia función de auditoría quedó expuesta.
    if (res.status() === 200) {
      throw new Error('SEGURIDAD: check_rls_policy_hygiene() es callable por anon — revisar REVOKEs en su migración.');
    }
    expect([401, 403, 404, 406]).toContain(res.status());
  });
});
