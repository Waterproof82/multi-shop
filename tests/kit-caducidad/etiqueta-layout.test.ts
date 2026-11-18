import { describe, expect, it } from 'vitest';
import { HOJA_ETIQUETAS, mmAPt, POR_PDF } from '@/lib/kit-caducidad/etiqueta-layout';

// sdd kit-expiry-m5 R-M5.3: todas las medidas de la hoja viven en este único
// módulo de constantes (R-M5.3.1); aquí solo se comprueban los invariantes
// geométricos (R-M5.3.2/R-M5.3.3), no valores exactos de diseño.

describe('HOJA_ETIQUETAS', () => {
  it('tiene 3 × 8 = 24 etiquetas por hoja (R-M5.3.2)', () => {
    expect(HOJA_ETIQUETAS.columnas).toBe(3);
    expect(HOJA_ETIQUETAS.filas).toBe(8);
    expect(HOJA_ETIQUETAS.columnas * HOJA_ETIQUETAS.filas).toBe(24);
  });

  it('el ancho de las columnas más los márgenes laterales cabe en A4 (210 mm)', () => {
    const anchoTotal = HOJA_ETIQUETAS.columnas * HOJA_ETIQUETAS.etiquetaAnchoMm + 2 * HOJA_ETIQUETAS.margenLateralMm;

    expect(anchoTotal).toBeLessThanOrEqual(210);
  });

  it('el alto de las filas más los márgenes superior/inferior cabe en A4 (297 mm)', () => {
    const altoTotal = HOJA_ETIQUETAS.filas * HOJA_ETIQUETAS.etiquetaAltoMm
      + HOJA_ETIQUETAS.margenSuperiorMm + HOJA_ETIQUETAS.margenInferiorMm;

    expect(altoTotal).toBeLessThanOrEqual(297);
  });

  it('el lado del QR es de al menos 15 mm (R-M5.3.3/R-M5.2.3)', () => {
    expect(HOJA_ETIQUETAS.qrMm).toBeGreaterThanOrEqual(15);
  });

  it('la suma de alturas del contenido de una etiqueta cabe en su alto (R-M5.3.3)', () => {
    const { contenido } = HOJA_ETIQUETAS;
    const altoContenido = contenido.margenSuperiorMm
      + contenido.marcaAltoMm
      + HOJA_ETIQUETAS.qrMm
      + contenido.gapQrMm
      + contenido.leyendaAltoMm
      + contenido.margenInferiorMm;

    expect(altoContenido).toBeLessThanOrEqual(HOJA_ETIQUETAS.etiquetaAltoMm);
  });
});

describe('mmAPt', () => {
  it('convierte 25,4 mm (1 pulgada) en 72 pt', () => {
    expect(mmAPt(25.4)).toBe(72);
  });
});

describe('POR_PDF', () => {
  it('limita cada PDF a 500 etiquetas (DD7)', () => {
    expect(POR_PDF).toBe(500);
  });
});
