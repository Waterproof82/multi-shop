'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

/**
 * Web Analytics y Speed Insights, con los dos filtros que este proyecto necesita.
 *
 * POR QUÉ ES UN COMPONENTE CLIENTE
 * `beforeSend` es una función, y una función no se puede pasar desde un Server
 * Component. `layout.tsx` es servidor, así que el filtro tiene que vivir aquí.
 *
 * POR QUÉ NO HACE FALTA NONCE (aunque la CSP use `strict-dynamic`)
 * La CSP de producción es `script-src 'self' 'nonce-…' 'strict-dynamic'`
 * (`src/proxy.ts`), y con `strict-dynamic` el `'self'` se IGNORA. Aun así estos
 * dos paquetes cargan sin tocar la política: no renderizan `<script>` en el JSX
 * —ambos componentes devuelven `null`— sino que lo crean con
 * `document.createElement('script')` desde código cliente, es decir, desde el
 * bundle de Next que ya va firmado con nonce. `strict-dynamic` existe justo para
 * eso: propaga la confianza al script inyectado por un script de confianza.
 * Los beacons van a `/_vercel/*`, mismo origen, cubiertos por `connect-src 'self'`.
 *
 * Ninguno de los dos paquetes acepta prop `nonce` — no la necesitan.
 *
 * FILTRO 1 — NAVEGADORES AUTOMATIZADOS (aplica a los dos)
 * La suite E2E corre contra el alias de producción en cada push a `main`. Con el
 * ritmo de commits de este repo son decenas de miles de cargas de página al mes.
 * Sin este filtro, Playwright se comería las cuotas (50.000 eventos de Analytics,
 * 10.000 puntos de Speed Insights) y —bastante peor— envenenaría los datos: las
 * métricas de un runner de CI no dicen NADA sobre un móvil en un restaurante.
 * Medir mal es más caro que no medir, porque encima te lo crees.
 *
 * FILTRO 2 — RUTAS DE PERSONAL (solo en Analytics)
 * Un TPV abierto toda la jornada genera navegación continua que no es
 * "audiencia": no dice nada del negocio y agota la cuota.
 *
 * Speed Insights SÍ las conserva, a propósito. Ahí es exactamente donde queremos
 * medir: es lo que llevamos un mes optimizando (offline, latencia, UI optimista)
 * y hasta ahora sin un solo dato de producción que dijera si funcionó.
 */

/** Rutas de personal. No son audiencia: son la herramienta de trabajo. */
const RUTAS_DE_PERSONAL = [
  '/admin',
  '/superadmin',
  '/tpv',
  '/waiter',
  '/kitchen',
  '/laborcontrol',
];

/**
 * Playwright y demás automatización exponen `navigator.webdriver === true`.
 * Se compara contra `true` porque en navegadores viejos la propiedad no existe.
 */
function esNavegadorAutomatizado(): boolean {
  return navigator.webdriver === true;
}

function rutaDe(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // Si no se puede parsear, se deja pasar el evento en vez de descartarlo:
    // perder una medición es mejor que cegar una ruta entera por un formato raro.
    return url;
  }
}

function esRutaDePersonal(url: string): boolean {
  const ruta = rutaDe(url);
  return RUTAS_DE_PERSONAL.some((prefijo) => ruta.startsWith(prefijo));
}

function filtrarEventoDeAudiencia(evento: BeforeSendEvent): BeforeSendEvent | null {
  if (esNavegadorAutomatizado()) return null;
  if (esRutaDePersonal(evento.url)) return null;
  return evento;
}

export function AnaliticaVercel() {
  return (
    <>
      <Analytics beforeSend={filtrarEventoDeAudiencia} />
      <SpeedInsights beforeSend={(metrica) => (esNavegadorAutomatizado() ? null : metrica)} />
    </>
  );
}
