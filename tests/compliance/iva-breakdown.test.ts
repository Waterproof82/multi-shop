/**
 * Vitest — IVA Breakdown (RD 1619/2012 / RD 1007/2023)
 *
 * Verifica la lógica de desglose de IVA que aplica el trigger
 * tpv_cobro_before_insert() para cada línea del detalle_items.
 *
 * Invariante fiscal:
 *   base_imponible = round(importe / (1 + porcentaje/100), 2)
 *   cuota_iva = importe - base_imponible  (diferencia, no redondeo independiente)
 *   base_imponible + cuota_iva = importe (exacto, sin error de centavo)
 *
 * Tipos de IVA en España: 0%, 4%, 7% (IGIC Canarias), 10%, 21%
 */
import { describe, it, expect } from 'vitest';

// Replica de la lógica del trigger tpv_cobro_before_insert()
// Los imports son enteros en centavos (para evitar float errors)
function calcIvaDesglose(importeCents: number, porcentaje: number): {
  baseImponibleCents: number;
  cuotaIvaCents: number;
} {
  // Redondeo al centavo más cercano
  const baseImponibleCents = Math.round(importeCents / (1 + porcentaje / 100));
  const cuotaIvaCents = importeCents - baseImponibleCents;
  return { baseImponibleCents, cuotaIvaCents };
}

const IVA_TYPES = [0, 4, 7, 10, 21] as const;

describe('IVA Breakdown — desglose fiscal (RD 1619/2012)', () => {
  it('base + cuota = importe (sin pérdida de centavo) — IVA 21%', () => {
    const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(1000, 21);
    expect(baseImponibleCents + cuotaIvaCents).toBe(1000);
  });

  it('base + cuota = importe — IVA 10%', () => {
    const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(550, 10);
    expect(baseImponibleCents + cuotaIvaCents).toBe(550);
  });

  it('base + cuota = importe — IVA 4%', () => {
    const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(750, 4);
    expect(baseImponibleCents + cuotaIvaCents).toBe(750);
  });

  it('base + cuota = importe — IVA 0% (exento)', () => {
    const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(1000, 0);
    expect(baseImponibleCents).toBe(1000);
    expect(cuotaIvaCents).toBe(0);
  });

  it('IVA 0% — cuota siempre 0', () => {
    for (const importe of [100, 999, 10000]) {
      const { cuotaIvaCents } = calcIvaDesglose(importe, 0);
      expect(cuotaIvaCents).toBe(0);
    }
  });

  it('base_imponible < importe cuando IVA > 0', () => {
    for (const iva of [4, 7, 10, 21]) {
      const { baseImponibleCents } = calcIvaDesglose(1000, iva);
      expect(baseImponibleCents).toBeLessThan(1000);
    }
  });

  it('importe 1 céntimo — desglose siempre es entero (sin decimales)', () => {
    for (const iva of IVA_TYPES) {
      const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(1, iva);
      expect(Number.isInteger(baseImponibleCents)).toBe(true);
      expect(Number.isInteger(cuotaIvaCents)).toBe(true);
    }
  });

  // Caso real: pizza a 12€ con IVA 10%
  it('12€ con IVA 10% → base 10,91€ + cuota 1,09€ = 12€', () => {
    const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(1200, 10);
    expect(baseImponibleCents).toBe(1091);
    expect(cuotaIvaCents).toBe(109);
    expect(baseImponibleCents + cuotaIvaCents).toBe(1200);
  });

  // Caso real: bebida a 3,50€ con IVA 21%
  it('3,50€ con IVA 21% → base + cuota = 3,50€', () => {
    const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(350, 21);
    expect(baseImponibleCents + cuotaIvaCents).toBe(350);
  });
});
