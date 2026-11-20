// src/lib/pet-id/csv.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 8 — R-QR.14.3: CSV `codigo,url` para que el proveedor imprima con
// datos variables. Defensa contra inyección de fórmula (Excel/Sheets
// ejecutan una celda que empieza por `= + - @`): aunque los códigos los
// genera siempre el servidor con un alfabeto que nunca produce ese prefijo,
// esta función es la única frontera de salida del CSV y no confía en el
// origen del valor.
import type { EtiquetaChapa } from '@/core/domain/entities/pet-chapa-types';

const PREFIJOS_PELIGROSOS = new Set(['=', '+', '-', '@']);

/** Antepone una comilla simple si la celda empezaría por un carácter que una hoja de cálculo interpretaría como fórmula. */
function escaparCeldaCsv(valor: string): string {
  return PREFIJOS_PELIGROSOS.has(valor[0] ?? '') ? `'${valor}` : valor;
}

/** Escapa comillas/comas/saltos de línea envolviendo en comillas dobles, después de neutralizar el prefijo de fórmula. */
function celdaCsv(valor: string): string {
  const segura = escaparCeldaCsv(valor);
  return /[",\r\n]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

/** R-QR.14.3: `codigo,url` en UTF-8 con fin de línea `\r\n`; nunca una columna de contacto. */
export function construirCsvChapas(etiquetas: EtiquetaChapa[]): string {
  const filas = etiquetas.map((e) => `${celdaCsv(e.codigo)},${celdaCsv(e.url)}`);
  return [...['codigo,url', ...filas]].join('\r\n') + '\r\n';
}
