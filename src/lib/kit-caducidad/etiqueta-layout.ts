// src/lib/kit-caducidad/etiqueta-layout.ts
// kit-expiry-m5 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m5/)
// R-M5.3.1: ÚNICO módulo con medidas en mm — ningún otro fichero (renderer,
// caso de uso, ruta) declara una medida física. DD4 (design.md): A4,
// 3 × 8 = 24 etiquetas de 70 × 37 mm, QR de 17 mm, fuentes estándar del PDF.

const PT_POR_MM = 72 / 25.4;

/** Milímetros a puntos PDF (72 pt = 1 pulgada = 25,4 mm). */
export function mmAPt(mm: number): number {
  return mm * PT_POR_MM;
}

/**
 * Reparto vertical del contenido de UNA etiqueta (DD4): marca arriba, fila
 * de QR al medio, leyenda del QR 2 y hueco antes de la serie. Alto total:
 * 2,5 + 3 + 17 (`qrMm`) + 2,5 + 4,5 + 2,5 ≈ 34 mm, por debajo de los 37 mm
 * de la etiqueta — deja margen para la serie en `Courier` 11 pt.
 */
const contenido = {
  margenSuperiorMm: 2.5,
  marcaAltoMm: 3,
  gapQrMm: 2.5,
  leyendaAltoMm: 4.5,
  margenInferiorMm: 2.5,
} as const;

export const HOJA_ETIQUETAS = {
  paginaAnchoMm: 210,
  paginaAltoMm: 297,
  columnas: 3,
  filas: 8,
  etiquetaAnchoMm: 70,
  etiquetaAltoMm: 37,
  margenLateralMm: 0,
  margenSuperiorMm: 0.5,
  margenInferiorMm: 0.5,
  /** Lado del QR impreso (R-M5.2.3/R-M5.3.3: ≥ 15 mm). */
  qrMm: 17,
  contenido,
} as const;

/** DD7: tope de etiquetas por PDF — el caso de uso trocea el lote en páginas de este tamaño. */
export const POR_PDF = 500;
