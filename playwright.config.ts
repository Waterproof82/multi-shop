import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Load .env.local so PLAYWRIGHT_* and SUPABASE_* vars are available in tests
config({ path: '.env.local', override: false });

/**
 * Cabecera para atravesar la protección de despliegue de Vercel.
 *
 * Las previews llevan Vercel Authentication activada, así que sin esto el edge
 * responde `401 {"code":"401","message":"Protected deployment"}` a TODA petición
 * y los tests nunca llegan a la app.
 *
 * Y lo peor no es que fallen: es que muchos PASAN por el motivo equivocado. Un
 * test que solo comprueba «devuelve 401» se pone verde con el 401 de Vercel sin
 * haber ejercitado nada.
 *
 * El secreto se genera en Vercel → Project Settings → Deployment Protection →
 * Protection Bypass for Automation, y se guarda como secret del repositorio.
 * Si no está definido no se manda nada, que es lo correcto contra localhost o
 * contra producción.
 */
function cabeceraDeBypass(): Record<string, string> {
  const secreto = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secreto ? { 'x-vercel-protection-bypass': secreto } : {};
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      ...cabeceraDeBypass(),
    },
  },
  // Solo se levanta un servidor propio si nadie ha dicho contra qué probar.
  // Ojo: `PLAYWRIGHT_BASE_URL` está definida en `.env.local`, así que en local
  // esto nunca se activa y los tests van contra la URL de ese fichero.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
