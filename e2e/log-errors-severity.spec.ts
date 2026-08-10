/**
 * E2E — Severidad real de fallos esperados en log_errors
 *
 * Los tests unitarios (tests/core/*-severity.test.ts) mockean el logger y
 * Sentry: prueban que NUESTRO código decide bien, no que la cadena real
 * request → ruta → use case → repositorio → logger → tabla `log_errors`
 * siga conectada de punta a punta contra infraestructura real (Supabase Auth
 * incluido, cuya forma de respuesta de error no controlamos).
 *
 * No se verifica contra la API real de Sentry a propósito: sería lento,
 * dependiente de red, y gastaría cuota de Sentry para probar que no la
 * gastamos. `log_errors.severity` es la señal real más barata disponible —
 * se persiste siempre, sea cual sea el destino final a Sentry.
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { test, expect } from '@playwright/test';
import { nuevoContexto } from './helpers/contexto';

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function serviceRoleKey(): string | undefined {
  return process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

test.describe('log_errors — severidad de fallos esperados (no deben capturarse en Sentry)', () => {
  test('login con contraseña incorrecta: queda en log_errors con severity "warning"', async ({ playwright, baseURL, request }) => {
    if (!supabaseUrl() || !serviceRoleKey()) {
      test.skip(true, 'NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidos');
      return;
    }

    // Login comparte rate limit (5 / 15 min por IP) con el test de login
    // legítimo de db-smoke.spec.ts. Si esta ventana ya se agotó, saltar
    // limpio en vez de fallar en falso — no es lo que este test verifica.
    const ctx = await nuevoContexto(playwright, baseURL);
    const marcador = `e2e-log-errors-severity-${Date.now()}@example-nonexistent.test`;
    const loginRes = await ctx.post('/api/admin/login', {
      data: { email: marcador, password: 'contraseña-definitivamente-incorrecta' },
    });
    await ctx.dispose();

    if (loginRes.status() === 429) {
      test.skip(true, 'Rate limit de login agotado en esta ventana — no se puede verificar en esta corrida');
      return;
    }
    expect(loginRes.status()).toBe(401);

    // Consulta directa a Supabase (no a nuestra app) — service_role, mismo
    // patrón que la suite "RPC directa" de db-smoke.spec.ts.
    const query = await request.get(
      `${supabaseUrl()}/rest/v1/log_errors?codigo=eq.AUTH_LOGIN_ERROR&order=created_at.desc&limit=1&select=severity,created_at`,
      { headers: { apikey: serviceRoleKey()!, Authorization: `Bearer ${serviceRoleKey()!}` } },
    );
    expect(query.status()).toBe(200);

    const filas = await query.json() as Array<{ severity: string; created_at: string }>;
    expect(filas.length).toBeGreaterThan(0);

    // La fila mas reciente debe ser DE ESTE intento, no una vieja que ya
    // estuviera en la tabla — si es vieja, el test no probó nada real.
    const edadMs = Date.now() - new Date(filas[0].created_at).getTime();
    expect(edadMs).toBeLessThan(15_000);

    expect(filas[0].severity).toBe('warning');
  });
});
