import { describe, expect, it } from 'vitest';
import { FORMATO_CHAPA, QR_MM_MIN, QR_MM_MAX, LADO_MM_MAX, mmAPt, calcularRejilla, validarFormatoChapa, POR_PDF } from '@/lib/pet-id/chapa-layout';

// sdd pet-id-qr-profile, Fase 8 (R-QR.14.1): este es el ÚNICO módulo con
// medidas en mm de la chapa — aquí solo se comprueban los invariantes
// geométricos, nunca un valor exacto de diseño (ver etiqueta-layout.test.ts
// de kit-caducidad, mismo patrón).

describe('FORMATO_CHAPA (por defecto)', () => {
  it('es redonda de Ø30 mm con un QR de 17 mm (R-QR.14.1)', () => {
    expect(FORMATO_CHAPA.forma).toBe('redonda');
    expect(FORMATO_CHAPA.diametroMm).toBe(30);
    expect(FORMATO_CHAPA.qrMm).toBe(17);
  });

  it('pasa sus propios invariantes', () => {
    expect(validarFormatoChapa(FORMATO_CHAPA)).toBeNull();
  });
});

describe('validarFormatoChapa', () => {
  it('rechaza un qrMm por debajo de 15 mm', () => {
    expect(validarFormatoChapa({ ...FORMATO_CHAPA, qrMm: 14 })).not.toBeNull();
  });

  it('rechaza un qrMm por encima de 60 mm', () => {
    expect(validarFormatoChapa({ ...FORMATO_CHAPA, qrMm: 61 })).not.toBeNull();
  });

  it('acepta qrMm en los límites 15 y 60 si la geometría cuadra', () => {
    expect(QR_MM_MIN).toBe(15);
    expect(QR_MM_MAX).toBe(60);
    expect(validarFormatoChapa({ ...FORMATO_CHAPA, forma: 'cuadrada', ladoMm: 60, qrMm: 15, margenMm: 1.5 })).toBeNull();
  });

  it('rechaza una chapa redonda por encima de 60 mm de diámetro', () => {
    expect(LADO_MM_MAX).toBe(60);
    expect(validarFormatoChapa({ ...FORMATO_CHAPA, diametroMm: 61 })).not.toBeNull();
  });

  it('rechaza una chapa cuadrada por encima de 60 mm de lado', () => {
    expect(validarFormatoChapa({ ...FORMATO_CHAPA, forma: 'cuadrada', ladoMm: 61, qrMm: 15 })).not.toBeNull();
  });

  it('rechaza un QR redondo que no cabe en el diámetro con su margen', () => {
    expect(validarFormatoChapa({ ...FORMATO_CHAPA, forma: 'redonda', diametroMm: 20, qrMm: 17, margenMm: 1.5 })).not.toBeNull();
  });

  it('rechaza un QR cuadrado que no cabe en el lado con su margen y el código', () => {
    expect(validarFormatoChapa({ ...FORMATO_CHAPA, forma: 'cuadrada', ladoMm: 20, qrMm: 17, margenMm: 1.5, mostrarCodigo: true })).not.toBeNull();
  });
});

describe('mmAPt', () => {
  it('convierte 25,4 mm (1 pulgada) en 72 pt', () => {
    expect(mmAPt(25.4)).toBe(72);
  });
});

describe('calcularRejilla', () => {
  it('la rejilla de la chapa redonda por defecto cabe en A4 y tiene al menos una chapa', () => {
    const { columnas, filas, porPagina } = calcularRejilla(FORMATO_CHAPA);
    expect(columnas).toBeGreaterThan(0);
    expect(filas).toBeGreaterThan(0);
    expect(porPagina).toBe(columnas * filas);
  });

  it('una chapa más grande cabe en menos columnas que una más pequeña', () => {
    const pequena = calcularRejilla({ ...FORMATO_CHAPA, diametroMm: 20 });
    const grande = calcularRejilla({ ...FORMATO_CHAPA, diametroMm: 60, qrMm: 20 });
    expect(grande.columnas).toBeLessThanOrEqual(pequena.columnas);
  });

  it('usa el lado (no el diámetro) cuando la forma es cuadrada', () => {
    const redonda = calcularRejilla({ ...FORMATO_CHAPA, forma: 'redonda', diametroMm: 30 });
    const cuadrada = calcularRejilla({ ...FORMATO_CHAPA, forma: 'cuadrada', ladoMm: 30 });
    expect(cuadrada).toEqual(redonda);
  });
});

describe('POR_PDF', () => {
  it('limita cada PDF a 500 etiquetas (mismo tope que kit-caducidad)', () => {
    expect(POR_PDF).toBe(500);
  });
});
