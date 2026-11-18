// src/lib/kit-caducidad/hoy-canarias.ts
// kit-expiry-m2a (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2a/)
// DD9 de design.md — REVISADO en sdd-apply (2026-11-18, decisión del
// propietario): `Atlantic/Canary`, no `Europe/Madrid`. Los clientes del kit
// están en Canarias, que NO comparte huso con la península: WET (UTC+0) en
// invierno, WEST (UTC+1) en verano — un desfase de 1h menos que Madrid
// (CET/CEST) todo el año. Usar `Europe/Madrid` aquí habría adelantado el
// cambio de día una hora en invierno para todos los clientes reales.

const FORMATO_DIA_CANARIAS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary' });

/**
 * Fecha civil de HOY en Canarias, como `YYYY-MM-DD`. `ahora` es inyectable
 * (por defecto `new Date()`) para poder fijarla en los tests de cambios de
 * horario y de fin de año.
 */
export function hoyEnCanarias(ahora: Date = new Date()): string {
  return FORMATO_DIA_CANARIAS.format(ahora);
}
