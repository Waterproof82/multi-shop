// src/lib/kit-caducidad/purga.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3b/DD9: purga por inactividad en código, sin RPC ni SQL agregado. El
// repositorio (M3d4) lee los `loteId` con contacto y, de la vista de
// caducidades efectivas, sus filas `(loteId, caducaEl)`; esta función pura
// decide qué lotes quedan libres (R-M3.5.2).

export type FilaCaducidadLote = { loteId: string; caducaEl: string };

export type ResultadoLotesInactivos = { inactivos: string[]; sinFechas: number };

/**
 * `hoy − 1 año` con `Date.UTC`: un 29-feb en el año de `hoy` cae en un año
 * no bisiesto y `Date.UTC` lo traslada automáticamente al 1 de marzo
 * (DD9) — nunca lanza ni desborda a otro mes salvo ese caso ya conocido.
 */
function limiteInactividad(hoy: string): string {
  const [anio, mes, dia] = hoy.split('-').map(Number);
  return new Date(Date.UTC(anio - 1, mes - 1, dia)).toISOString().slice(0, 10);
}

function maximaCaducidadPorLote(
  lotesConContacto: ReadonlySet<string>,
  filas: readonly FilaCaducidadLote[],
): Map<string, string> {
  const maximos = new Map<string, string>();
  for (const fila of filas) {
    if (!lotesConContacto.has(fila.loteId)) continue; // fila de un lote sin contacto: no se purga ni cuenta
    const actual = maximos.get(fila.loteId);
    if (actual === undefined || fila.caducaEl > actual) {
      maximos.set(fila.loteId, fila.caducaEl);
    }
  }
  return maximos;
}

/**
 * R-M3.5.2/R-M3.5.3: de los lotes CON contacto, el que no tiene ninguna
 * fila de caducidad cuenta como `sinFechas` (no se purga, D-M3-11). El
 * resto es inactivo si su caducidad más tardía es ANTERIOR (estricto) a
 * `hoy − 1 año`.
 */
export function lotesInactivos(
  hoy: string,
  lotesConContacto: readonly string[],
  filas: readonly FilaCaducidadLote[],
): ResultadoLotesInactivos {
  const limite = limiteInactividad(hoy);
  const conContacto = new Set(lotesConContacto);
  const maximos = maximaCaducidadPorLote(conContacto, filas);

  const inactivos: string[] = [];
  let sinFechas = 0;
  for (const loteId of lotesConContacto) {
    const maxCaducaEl = maximos.get(loteId);
    if (maxCaducaEl === undefined) {
      sinFechas += 1;
      continue;
    }
    if (maxCaducaEl < limite) inactivos.push(loteId);
  }

  return { inactivos, sinFechas };
}
