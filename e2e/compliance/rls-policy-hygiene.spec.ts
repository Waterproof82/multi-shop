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
 * estos patrones.
 *
 * 2026-07-31 (segunda pasada, tras encontrar 6 RPCs SECURITY INVOKER
 * expuestas sin necesidad — ver supabase-security-definer.spec.ts): se
 * añadió `view_missing_security_invoker` por la misma clase de problema en
 * otro objeto de DB — una VIEW sin `security_invoker = true` corre con los
 * privilegios de quien la creó, pudiendo saltarse RLS igual que una función
 * SECURITY DEFINER.
 *
 * 2026-07-31 (tercera pasada — meta-revisión "qué otro default inseguro no
 * se audita sistemáticamente"): se encontró la causa raíz real detrás de
 * todos los incidentes de hoy — ALTER DEFAULT PRIVILEGES en `public` (rol
 * `postgres`) otorgaba automáticamente acceso completo a anon/authenticated
 * en toda tabla/función/secuencia NUEVA. Corregido en
 * 20260731000017 (verificado en vivo: una tabla de prueba creada después del
 * fix no heredó ningún privilegio). Se añadieron 4 chequeos más:
 * `default_privileges_grant_anon` (regresión de lo anterior — sigue
 * detectando el residuo de `supabase_admin`, ver whitelist abajo),
 * `security_definer_missing_search_path` (schema hijacking),
 * `bypassrls_unexpected_role` (rol no estándar saltándose RLS por completo),
 * `insert_policy_missing_with_check` (policy INSERT sin WITH CHECK explícito
 * = WITH CHECK(true) implícito). Los 4 verificados en vivo con objetos de
 * prueba descartables antes de confirmarlos como permanentes.
 *
 * 2026-07-31 (auditoría externa, cuarta pasada — "¿el GRANT subyacente es
 * necesario, no solo la policy que lo restringe?"): los 9 checks anteriores
 * auditan la FORMA de las policies de RLS, no si el GRANT de tabla que hay
 * debajo sigue siendo necesario. El fix de 20260731000017 (ALTER DEFAULT
 * PRIVILEGES) solo evita que tablas NUEVAS nazcan expuestas — nunca tocó
 * retroactivamente las 53 tablas que ya existían, que seguían con
 * INSERT/UPDATE/DELETE/TRUNCATE de tabla completa otorgados a `anon` desde
 * antes del bootstrap de este proyecto en el hosting gestionado de Supabase.
 * Ninguna policy RESTRICTIVE, por bien escrita que esté, puede frenar
 * TRUNCATE — RLS no se aplica a ese comando en Postgres. Se añadió
 * `anon_write_grant` (20260731000019): sin whitelist, porque la arquitectura
 * del proyecto es anon-solo-lectura / service_role-para-escrituras (ver
 * security.md → "Row Level Security (RLS)") — no hay ninguna tabla donde
 * `anon` deba tener estos 4 privilegios.
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY
 * (o SUPABASE_SERVICE_ROLE_KEY)
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

function supabaseUrl(): string | undefined { return process.env.NEXT_PUBLIC_SUPABASE_URL; }
function serviceRoleKey(): string | undefined {
  return process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}
function anonKey(): string | undefined { return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; }

type HygieneCheckName =
  | 'permissive_anon_deny'
  | 'public_role_identity_scoped_fn'
  | 'public_role_blanket_true'
  | 'rls_disabled'
  | 'view_missing_security_invoker'
  | 'default_privileges_grant_anon'
  | 'security_definer_missing_search_path'
  | 'bypassrls_unexpected_role'
  | 'insert_policy_missing_with_check'
  | 'anon_write_grant';

interface HygieneViolation {
  check_name: HygieneCheckName;
  tablename: string;
  policyname: string | null;
  detail: string;
}

// Tables where a `roles:public USING(true)` SELECT policy is intentional —
// genuinely public storefront catalog data (menu browsing), never PII.
// Any other roles:public + qual=true/with_check=true policy is a likely leak
// (this is exactly the shape of the "Public can select idioma" leak on
// clientes, see 20260731000007). Add here only for deliberately public reads.
const INTENTIONAL_PUBLIC_TRUE_TABLES = new Set<string>(['categorias', 'empresas', 'productos']);

// default_privileges_grant_anon rows where `policyname` holds the grantor
// role name. `supabase_admin`-owned default ACLs on public grant anon/
// authenticated on objects that role creates, but no part of this project's
// actual migration workflow (Supabase CLI / MCP / dashboard SQL editor as
// project owner) creates objects as supabase_admin — verified only
// `postgres`-owned entries are load-bearing (a table created via the normal
// workflow got zero anon/authenticated grants once the postgres-owned entry
// was fixed). REVOKE on supabase_admin's entries returns permission denied
// (postgres is not a member of supabase_admin in Supabase's managed
// hosting) — not fixable from this project, tracked here instead of ignored.
const INTENTIONAL_DEFAULT_PRIVILEGE_GRANTORS = new Set<string>(['supabase_admin']);

async function fetchHygieneRows(request: APIRequestContext): Promise<HygieneViolation[] | null> {
  const res = await request.post(`${supabaseUrl()}/rest/v1/rpc/check_rls_policy_hygiene`, {
    headers: {
      apikey: serviceRoleKey()!,
      Authorization: `Bearer ${serviceRoleKey()!}`,
      'Content-Type': 'application/json',
    },
    data: {},
  });

  if (res.status() === 404) {
    test.skip(true, 'check_rls_policy_hygiene RPC no existe — ver supabase/migrations/2026073100000{9,17,18}_*.sql');
    return null;
  }

  expect(res.status()).toBe(200);
  return (await res.json()) as HygieneViolation[];
}

test.describe('RLS Policy Hygiene — escaneo completo del schema (service_role)', () => {
  test.beforeEach(() => {
    if (!supabaseUrl() || !serviceRoleKey()) {
      test.skip(true, 'NEXT_PUBLIC_SUPABASE_URL o PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY no definidos');
    }
  });

  test('ninguna tabla tiene un "no anon access" PERMISSIVE (debe ser RESTRICTIVE)', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
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
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
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

  test('ninguna policy roles:public con USING/WITH CHECK (true) fuera de la whitelist de catálogo público', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
    const violations = rows.filter(
      r => r.check_name === 'public_role_blanket_true' && !INTENTIONAL_PUBLIC_TRUE_TABLES.has(r.tablename)
    );

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename}.${v.policyname} (${v.detail})`).join('\n');
      throw new Error(
        `SEGURIDAD: policies roles:public con USING/WITH CHECK (true) fuera de la whitelist de catálogo público:\n${list}\n\n` +
          `Una policy RESTRICTIVE para anon NO protege esto — solo restringe anon, no authenticated. ` +
          `Si es una lectura pública legítima (catálogo), agregar la tabla a INTENTIONAL_PUBLIC_TRUE_TABLES en este archivo. ` +
          `Si no, recrear la policy con TO authenticated y/o el scope de tenant que le falte.`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('ninguna tabla del schema public tiene RLS deshabilitado', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
    const violations = rows.filter(r => r.check_name === 'rls_disabled');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename}`).join('\n');
      throw new Error(`SEGURIDAD: tablas sin RLS habilitado:\n${list}\n\nAplicar: ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;`);
    }
    expect(violations).toHaveLength(0);
  });

  test('ninguna vista del schema public carece de security_invoker=true', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
    const violations = rows.filter(r => r.check_name === 'view_missing_security_invoker');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename} (${v.detail})`).join('\n');
      throw new Error(
        `SEGURIDAD: vistas sin security_invoker=true:\n${list}\n\n` +
          `Una vista sin security_invoker=true corre con los privilegios de quien la creó, no de quien la consulta — ` +
          `puede saltarse RLS de las tablas subyacentes por completo, el mismo riesgo que una función SECURITY DEFINER. ` +
          `Aplicar: ALTER VIEW public.<vista> SET (security_invoker = true); ` +
          `(las vistas materializadas no tienen este modo — nunca deben exponerse a anon/authenticated si tocan datos sensibles).`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('los privilegios por defecto de public no otorgan a anon/authenticated (fuera de la whitelist conocida)', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
    const violations = rows.filter(
      r => r.check_name === 'default_privileges_grant_anon' && !INTENTIONAL_DEFAULT_PRIVILEGE_GRANTORS.has(r.policyname ?? '')
    );

    if (violations.length > 0) {
      const list = violations.map(v => `  - grantor=${v.policyname} (${v.detail})`).join('\n');
      throw new Error(
        `SEGURIDAD: ALTER DEFAULT PRIVILEGES en public otorga a anon/authenticated — cualquier tabla/función/secuencia ` +
          `NUEVA nace expuesta sin que nadie tenga que olvidarse de nada:\n${list}\n\n` +
          `Aplicar (reemplazar <role> por el grantor listado arriba):\n` +
          `  ALTER DEFAULT PRIVILEGES FOR ROLE <role> IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;\n` +
          `  ALTER DEFAULT PRIVILEGES FOR ROLE <role> IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;\n` +
          `  ALTER DEFAULT PRIVILEGES FOR ROLE <role> IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('ninguna función SECURITY DEFINER de public carece de SET search_path', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
    const violations = rows.filter(r => r.check_name === 'security_definer_missing_search_path');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename}()`).join('\n');
      throw new Error(
        `SEGURIDAD: funciones SECURITY DEFINER sin SET search_path (vulnerable a schema hijacking):\n${list}\n\n` +
          `Agregar SET search_path = public, extensions, pg_catalog (o el que corresponda) a la definición de la función.`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('ningún rol no estándar tiene BYPASSRLS', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
    const violations = rows.filter(r => r.check_name === 'bypassrls_unexpected_role');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename}`).join('\n');
      throw new Error(
        `SEGURIDAD: roles con rolbypassrls=true fuera de los roles estándar de Supabase:\n${list}\n\n` +
          `Un rol con BYPASSRLS ignora TODAS las policies de RLS, sin importar cómo estén configuradas. ` +
          `Aplicar: ALTER ROLE <rol> NOBYPASSRLS; salvo que sea intencional (agregar a la whitelist del check si lo es).`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('ninguna policy INSERT carece de WITH CHECK explícito', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
    const violations = rows.filter(r => r.check_name === 'insert_policy_missing_with_check');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename}.${v.policyname}`).join('\n');
      throw new Error(
        `SEGURIDAD: policies INSERT sin WITH CHECK explícito (equivale a WITH CHECK(true) — inserción sin restricción):\n${list}\n\n` +
          `Agregar WITH CHECK con la misma condición de tenant/rol que el resto de policies de la tabla.`
      );
    }
    expect(violations).toHaveLength(0);
  });

  test('ninguna tabla otorga a anon INSERT/UPDATE/DELETE/TRUNCATE a nivel de tabla', async ({ request }) => {
    const rows = await fetchHygieneRows(request);
    if (!rows) return;
    const violations = rows.filter(r => r.check_name === 'anon_write_grant');

    if (violations.length > 0) {
      const list = violations.map(v => `  - ${v.tablename} (${v.detail})`).join('\n');
      throw new Error(
        `SEGURIDAD: anon tiene privilegios de escritura de tabla que la arquitectura del proyecto nunca necesita ` +
          `(anon = solo lectura vía RLS, service_role = todas las escrituras):\n${list}\n\n` +
          `TRUNCATE es el caso crítico: ninguna policy RLS (RESTRICTIVE o no) puede frenarlo — es una limitación de ` +
          `Postgres, no de esta app. Revocar con:\n` +
          `  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.<tabla> FROM anon;`
      );
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
