import type { APIRequestContext, Playwright } from '@playwright/test';

/**
 * Creación de contextos de petición que atraviesan la protección de Vercel.
 *
 * POR QUÉ HACE FALTA
 * `playwright.config.ts` define `use.extraHTTPHeaders`, pero eso solo llega al
 * fixture `request` que Playwright inyecta. Un contexto creado a mano con
 * `playwright.request.newContext()` **no hereda nada de ahí**.
 *
 * Contra una preview de Vercel con Deployment Protection activa, ese detalle es
 * la diferencia entre probar la app y no probar nada: sin la cabecera de bypass
 * el edge responde `401 Protected deployment` a todo, el login del camarero
 * falla, y los tests que dependen de él se SALTAN en silencio. El job sale en
 * verde habiendo ejercitado la mitad.
 *
 * Por eso todos los specs que necesitan su propio contexto —los que manejan
 * cookies de sesión, que son casi todos los interesantes— deben crearlo aquí.
 */

/** Cabeceras base de cualquier contexto de este proyecto. */
export function cabecerasDePrueba(): Record<string, string> {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return {
    'Content-Type': 'application/json',
    ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
  };
}

/**
 * Contexto de peticiones con las cabeceras correctas ya puestas.
 *
 * Sustituye a `playwright.request.newContext({ baseURL })` en todos los specs.
 */
export function nuevoContexto(
  playwright: Playwright,
  baseURL: string | undefined,
  extra?: Record<string, string>,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { ...cabecerasDePrueba(), ...extra },
  });
}
