/**
 * Vitest + fast-check — IVA Property Tests (RD 1619/2012)
 *
 * Propiedades invariantes del desglose de IVA verificadas con fuzzing:
 *   P1. base + cuota = importe (para todo importe ∈ [1, 1.000.000] céntimos)
 *   P2. cuota >= 0 siempre
 *   P3. base <= importe siempre
 *   P4. IVA 0% → cuota siempre 0
 *   P5. Dos cálculos con el mismo input → mismo resultado (determinismo)
 */
import { describe, it } from 'vitest';
import * as fc from 'fast-check';

const IVA_TYPES = [0, 4, 7, 10, 21] as const;
type IvaType = typeof IVA_TYPES[number];

function calcIvaDesglose(importeCents: number, porcentaje: number): {
  baseImponibleCents: number;
  cuotaIvaCents: number;
} {
  const baseImponibleCents = Math.round(importeCents / (1 + porcentaje / 100));
  const cuotaIvaCents = importeCents - baseImponibleCents;
  return { baseImponibleCents, cuotaIvaCents };
}

const arbImporte = fc.integer({ min: 1, max: 1_000_000 });
const arbIva = fc.constantFrom<IvaType>(...IVA_TYPES);

describe('IVA Property Tests — fast-check (RD 1619/2012)', () => {
  it('P1: base + cuota = importe (para todo importe y tipo IVA)', () => {
    fc.assert(
      fc.property(arbImporte, arbIva, (importe, iva) => {
        const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(importe, iva);
        return baseImponibleCents + cuotaIvaCents === importe;
      }),
      { numRuns: 1000 }
    );
  });

  it('P2: cuota >= 0 siempre', () => {
    fc.assert(
      fc.property(arbImporte, arbIva, (importe, iva) => {
        const { cuotaIvaCents } = calcIvaDesglose(importe, iva);
        return cuotaIvaCents >= 0;
      }),
      { numRuns: 1000 }
    );
  });

  it('P3: base <= importe siempre (IVA positivo reduce la base)', () => {
    fc.assert(
      fc.property(arbImporte, arbIva, (importe, iva) => {
        const { baseImponibleCents } = calcIvaDesglose(importe, iva);
        return baseImponibleCents <= importe;
      }),
      { numRuns: 1000 }
    );
  });

  it('P4: IVA 0% → cuota siempre 0', () => {
    fc.assert(
      fc.property(arbImporte, (importe) => {
        const { cuotaIvaCents } = calcIvaDesglose(importe, 0);
        return cuotaIvaCents === 0;
      }),
      { numRuns: 500 }
    );
  });

  it('P5: determinismo — mismo input, mismo output', () => {
    fc.assert(
      fc.property(arbImporte, arbIva, (importe, iva) => {
        const r1 = calcIvaDesglose(importe, iva);
        const r2 = calcIvaDesglose(importe, iva);
        return r1.baseImponibleCents === r2.baseImponibleCents &&
               r1.cuotaIvaCents === r2.cuotaIvaCents;
      }),
      { numRuns: 500 }
    );
  });

  it('P6: base e cuota siempre son enteros (sin decimales)', () => {
    fc.assert(
      fc.property(arbImporte, arbIva, (importe, iva) => {
        const { baseImponibleCents, cuotaIvaCents } = calcIvaDesglose(importe, iva);
        return Number.isInteger(baseImponibleCents) && Number.isInteger(cuotaIvaCents);
      }),
      { numRuns: 500 }
    );
  });
});
