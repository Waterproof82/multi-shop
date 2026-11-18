// sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3b/DD9: purga por
// inactividad en código. `lotesInactivos` solo mira los lotes CON contacto
// (`lotesConContacto`); de sus filas de caducidad toma el máximo `caducaEl`
// por lote y lo compara con `hoy − 1 año` (R-M3.5.2: "anterior a", límite
// EXCLUSIVO).
import { describe, expect, it } from 'vitest';
import { lotesInactivos } from '@/lib/kit-caducidad/purga';

describe('lotesInactivos', () => {
  it('un lote cuya caducidad más tardía es anterior a hoy − 1 año es inactivo', () => {
    const { inactivos } = lotesInactivos('2027-06-10', ['A'], [{ loteId: 'A', caducaEl: '2026-06-09' }]);

    expect(inactivos).toEqual(['A']);
  });

  it('el límite es exclusivo: caducaEl == hoy − 1 año no es inactivo', () => {
    const { inactivos } = lotesInactivos('2027-06-10', ['A'], [{ loteId: 'A', caducaEl: '2026-06-10' }]);

    expect(inactivos).toEqual([]);
  });

  it('manda el máximo por lote: una fila vieja y otra reciente no lo hacen inactivo', () => {
    const { inactivos } = lotesInactivos('2027-06-10', ['A'], [
      { loteId: 'A', caducaEl: '2020-01-01' },
      { loteId: 'A', caducaEl: '2026-06-10' },
    ]);

    expect(inactivos).toEqual([]);
  });

  it('con hoy 2028-02-29 (bisiesto), el límite es 2027-03-01 (29-feb no existe en 2027)', () => {
    const antesDelLimite = lotesInactivos('2028-02-29', ['A'], [{ loteId: 'A', caducaEl: '2027-02-28' }]);
    const enElLimite = lotesInactivos('2028-02-29', ['A'], [{ loteId: 'A', caducaEl: '2027-03-01' }]);

    expect(antesDelLimite.inactivos).toEqual(['A']);
    expect(enElLimite.inactivos).toEqual([]);
  });

  it('un lote con contacto sin ninguna fila de caducidad cuenta como sinFechas', () => {
    const { inactivos, sinFechas } = lotesInactivos('2027-06-10', ['A', 'B'], [
      { loteId: 'A', caducaEl: '2020-01-01' },
    ]);

    expect(inactivos).toEqual(['A']);
    expect(sinFechas).toBe(1);
  });

  it('ignora filas de lotes sin contacto', () => {
    const { inactivos, sinFechas } = lotesInactivos('2027-06-10', ['A'], [
      { loteId: 'A', caducaEl: '2020-01-01' },
      { loteId: 'ZZZ-sin-contacto', caducaEl: '2020-01-01' },
    ]);

    expect(inactivos).toEqual(['A']);
    expect(sinFechas).toBe(0);
  });
});
