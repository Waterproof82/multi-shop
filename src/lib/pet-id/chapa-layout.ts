// src/lib/pet-id/chapa-layout.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 8 — R-QR.14.1: ÚNICO módulo con medidas en mm de la chapa física —
// ningún otro fichero (renderer, caso de uso, ruta) declara una medida
// física. A diferencia de `kit-caducidad/etiqueta-layout.ts` (hoja de
// tamaño fijo), aquí el tamaño/forma son configurables y la rejilla de la
// hoja A4 SE CALCULA a partir de ese tamaño, nunca se fija a mano.

const PT_POR_MM = 72 / 25.4;

/** Milímetros a puntos PDF (72 pt = 1 pulgada = 25,4 mm). */
export function mmAPt(mm: number): number {
  return mm * PT_POR_MM;
}

export const PAGINA_A4_MM = { anchoMm: 210, altoMm: 297 } as const;

export type FormaChapa = 'redonda' | 'cuadrada';

export interface FormatoChapa {
  forma: FormaChapa;
  /** Usado cuando `forma === 'redonda'`. */
  diametroMm: number;
  /** Usado cuando `forma === 'cuadrada'`. */
  ladoMm: number;
  qrMm: number;
  margenMm: number;
  separacionMm: number;
  mostrarCodigo: boolean;
  guiaCorte: boolean;
}

/** R-QR.14.1: redonda Ø30 mm con QR de 17 mm — el valor por defecto hasta confirmar el proveedor (pregunta abierta de design.md). */
export const FORMATO_CHAPA: FormatoChapa = {
  forma: 'redonda',
  diametroMm: 30,
  ladoMm: 30,
  qrMm: 17,
  margenMm: 1.5,
  separacionMm: 3,
  mostrarCodigo: true,
  guiaCorte: true,
};

/** R-QR.14.1: el QR nunca mide menos de 15 mm (legible) ni más de 60 mm (tamaño máximo de chapa). */
export const QR_MM_MIN = 15;
export const QR_MM_MAX = 60;
/** R-QR.14.1: la chapa, cuadrada o redonda, no supera los 60×60 mm. */
export const LADO_MM_MAX = 60;

/** Alto reservado para el código impreso debajo del QR (Courier ~7pt + margen), si `mostrarCodigo`. */
const ALTO_CODIGO_MM = 4.5;

function ladoEfectivoMm(f: FormatoChapa): number {
  return f.forma === 'redonda' ? f.diametroMm : f.ladoMm;
}

/**
 * R-QR.14.1: valida los invariantes de un formato antes de usarlo — nunca se
 * confía en una constante editada a mano sin pasar por aquí. Devuelve `null`
 * si es válido, o un mensaje describiendo el primer invariante incumplido.
 */
export function validarFormatoChapa(f: FormatoChapa): string | null {
  if (f.qrMm < QR_MM_MIN || f.qrMm > QR_MM_MAX) {
    return `qrMm debe estar entre ${QR_MM_MIN} y ${QR_MM_MAX} mm`;
  }
  const lado = ladoEfectivoMm(f);
  if (lado > LADO_MM_MAX) {
    return `la chapa no puede superar ${LADO_MM_MAX} mm`;
  }
  if (f.forma === 'redonda') {
    // El QR es cuadrado; su diagonal debe caber en el círculo útil (diámetro
    // menos el margen en cada lado).
    const diagonalQrMm = Math.SQRT2 * f.qrMm;
    if (diagonalQrMm > f.diametroMm - 2 * f.margenMm) {
      return 'el QR no cabe en la chapa redonda con ese margen';
    }
  } else {
    const altoNecesarioMm = f.qrMm + 2 * f.margenMm + (f.mostrarCodigo ? ALTO_CODIGO_MM : 0);
    if (altoNecesarioMm > f.ladoMm) {
      return 'el QR y el código no caben en la chapa cuadrada con ese margen';
    }
  }
  return null;
}

/**
 * Calcula cuántas chapas entran en una hoja A4, a partir del tamaño
 * configurado (más la separación entre chapas) — nunca un valor fijo.
 */
export function calcularRejilla(f: FormatoChapa): { columnas: number; filas: number; porPagina: number } {
  const ladoConSeparacionMm = ladoEfectivoMm(f) + f.separacionMm;
  const columnas = Math.max(1, Math.floor(PAGINA_A4_MM.anchoMm / ladoConSeparacionMm));
  const filas = Math.max(1, Math.floor(PAGINA_A4_MM.altoMm / ladoConSeparacionMm));
  return { columnas, filas, porPagina: columnas * filas };
}

/** Tope de chapas por PDF — el caso de uso trocea el lote en páginas de este tamaño (mismo valor que `kit-caducidad/etiqueta-layout.ts`). */
export const POR_PDF = 500;
