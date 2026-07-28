/**
 * E2E — Supabase SECURITY DEFINER function exposure audit (OWASP A01)
 *
 * Detecta funciones SECURITY DEFINER expuestas a anon o authenticated en la
 * REST API sin ser intencionalmente públicas. Este es el mismo error que ocurrió
 * en 2026-07-28 con rgpd_purge_log_immutable y tpv_cobro_audit_after_insert:
 * funciones de trigger que heredaron el grant PUBLIC al crearse y quedaron
 * accesibles via /rest/v1/rpc/<nombre>.
 *
 * Estrategia de detección (dos capas):
 *
 *   Capa 1 — Intento directo como anon:
 *     Llama a las funciones trigger críticas directamente como rol anon.
 *     Si responde 200, el REVOKE no está aplicado. 404/401/403 = correcto.
 *
 *   Capa 2 — SQL via service_role:
 *     Consulta information_schema.role_routine_grants para detectar cualquier
 *     función SECURITY DEFINER con EXECUTE a anon que no esté en la whitelist.
 *     Esto captura funciones nuevas ANTES de que sean explotables.
 *
 * Whitelist intencionalmente expuestas a authenticated (no a anon):
 *   - get_mi_empresa_id: usada en RLS USING clauses — authenticated necesita EXECUTE
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL         — URL del proyecto Supabase
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY    — anon key (para test capa 1)
 *   PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY — service_role key (para capa 2)
 *
 * En CI: las tres variables están disponibles en el job playwright-compliance.
 */
import { test, expect } from '@playwright/test';

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}
function anonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
function serviceRoleKey(): string | undefined {
  return (
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Funciones trigger conocidas que NUNCA deben ser llamables por anon/authenticated.
// Si alguna responde 200, el REVOKE no está aplicado.
const TRIGGER_FUNCTIONS_MUST_BE_BLOCKED = [
  'rgpd_purge_log_immutable',
  'tpv_cobro_audit_after_insert',
  'notify_waiter_items_update',
  'notify_waiter_new_order',
  'notify_waiter_order_validated',
  'push_on_new_order',
] as const;

// Funciones SECURITY DEFINER que exponen acceso a anon de forma INTENCIONAL.
// Actualizar este set si se añade una función deliberadamente pública.
const INTENTIONAL_ANON_WHITELIST = new Set<string>([
  // (vacío — ninguna función debe ser callable por anon en este proyecto)
]);

// Funciones SECURITY DEFINER callable por authenticated de forma INTENCIONAL.
// get_mi_empresa_id: RLS policies de tablas usan esta función — authenticated
// necesita EXECUTE para que las policies funcionen.
const INTENTIONAL_AUTHENTICATED_WHITELIST = new Set<string>([
  'get_mi_empresa_id',
]);

// ── Capa 1: intento directo como anon ─────────────────────────────────────────

test.describe('SECURITY DEFINER — funciones trigger no llamables por anon (capa 1)', () => {
  test.beforeEach(() => {
    if (!supabaseUrl() || !anonKey()) {
      test.skip(
        true,
        'NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no definidos'
      );
    }
  });

  for (const fnName of TRIGGER_FUNCTIONS_MUST_BE_BLOCKED) {
    test(`anon no puede llamar ${fnName}() via REST → 404 o 401/403 (nunca 200)`, async ({
      request,
    }) => {
      const res = await request.post(`${supabaseUrl()}/rest/v1/rpc/${fnName}`, {
        headers: {
          apikey: anonKey()!,
          Authorization: `Bearer ${anonKey()!}`,
          'Content-Type': 'application/json',
        },
        data: {},
      });

      // 200 = FALLO CRÍTICO: función accesible por anon sin autenticación
      // 404 = OK: función no expuesta en PostgREST schema (REVOKE correcto o no en search_path)
      // 401 = OK: requiere auth
      // 403 = OK: permiso denegado
      // 406 = OK: content-type no aceptado (función existe pero no devuelve rows)
      if (res.status() === 200) {
        const body = await res.text().catch(() => '(no body)');
        throw new Error(
          `SEGURIDAD: ${fnName}() es callable por anon via REST API. ` +
            `Aplicar: REVOKE EXECUTE ON FUNCTION public.${fnName}() FROM PUBLIC, anon, authenticated. ` +
            `Respuesta: ${body.substring(0, 200)}`
        );
      }

      expect([401, 403, 404, 406]).toContain(res.status());
    });
  }
});

// ── Capa 2: SQL scan via service_role ─────────────────────────────────────────

test.describe('SECURITY DEFINER — SQL scan de grants (capa 2, service_role)', () => {
  test.beforeEach(() => {
    if (!supabaseUrl() || !serviceRoleKey()) {
      test.skip(
        true,
        'NEXT_PUBLIC_SUPABASE_URL o PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY no definidos'
      );
    }
  });

  test('ninguna función SECURITY DEFINER del schema public tiene EXECUTE a anon sin whitelist', async ({
    request,
  }) => {
    // Supabase expone PostgreSQL via /rest/v1/ — usamos una tabla de information_schema
    // no disponible via REST. En su lugar, llamamos a una RPC que wrappea la query.
    // Como alternativa, usamos la Management API de Supabase si está disponible.
    //
    // Workaround portátil: query via pg_roles usando la función rpc ejecutable con service_role.
    // Aquí usamos el endpoint de /rest/v1/ con un header especial que bypasa RLS.
    const res = await request.post(
      `${supabaseUrl()}/rest/v1/rpc/check_security_definer_grants`,
      {
        headers: {
          apikey: serviceRoleKey()!,
          Authorization: `Bearer ${serviceRoleKey()!}`,
          'Content-Type': 'application/json',
        },
        data: {},
      }
    );

    // Si la función no existe (aún no creada), skip del test
    if (res.status() === 404) {
      test.skip(
        true,
        'check_security_definer_grants RPC no existe — ver supabase/migrations/20260728000002_security_definer_audit_fn.sql'
      );
      return;
    }

    expect(res.status()).toBe(200);

    const rows = (await res.json()) as Array<{
      routine_name: string;
      grantee: string;
    }>;

    // Filtrar la whitelist intencional
    const violations = rows.filter(row => {
      if (row.grantee === 'anon') {
        return !INTENTIONAL_ANON_WHITELIST.has(row.routine_name);
      }
      if (row.grantee === 'authenticated') {
        return !INTENTIONAL_AUTHENTICATED_WHITELIST.has(row.routine_name);
      }
      return false;
    });

    if (violations.length > 0) {
      const list = violations
        .map(v => `  - ${v.routine_name}() EXECUTE → ${v.grantee}`)
        .join('\n');
      throw new Error(
        `SEGURIDAD: Funciones SECURITY DEFINER con EXECUTE a anon/authenticated sin whitelist:\n${list}\n\n` +
          `Para cada función, aplicar en una migración:\n` +
          `  REVOKE EXECUTE ON FUNCTION public.<nombre>() FROM PUBLIC;\n` +
          `  REVOKE EXECUTE ON FUNCTION public.<nombre>() FROM anon;\n` +
          `  REVOKE EXECUTE ON FUNCTION public.<nombre>() FROM authenticated;\n\n` +
          `Si el acceso es intencional, añadir a INTENTIONAL_*_WHITELIST en este archivo.`
      );
    }

    expect(violations).toHaveLength(0);
  });
});
