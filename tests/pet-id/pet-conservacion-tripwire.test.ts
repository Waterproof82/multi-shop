import { describe, expect, it } from 'vitest';
import { RENOVACION_PERFIL_IMPLEMENTADA, PLAZO_CONSERVACION_ANIOS } from '@/lib/pet-id/conservacion';

// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// DD16/R10 (design.md, tasks.md): el plazo de conservación es de 3 años
// desde la última confirmación. La migración (PR1) se aplicó a la BD real
// el 2026-11-20, así que el primer perfil llegaría a los 3 años reales el
// 2029-11-20. Este tripwire fija la fecha ~6 meses ANTES, el 2029-05-19,
// con margen de sobra para implementar la renovación/purga antes de que
// haya datos reales que purgar — no es la fecha límite real, es el aviso.
//
// Mientras no haya pasado el margen: `RENOVACION_PERFIL_IMPLEMENTADA` debe
// seguir en `false` (fuera del MVP). A partir de la fecha de margen: debe
// ser `true`, o este test falla y avisa de que hay que implementarla.
const FECHA_TRIPWIRE = new Date('2029-05-19T00:00:00Z').getTime();

describe('RENOVACION_PERFIL_IMPLEMENTADA (tripwire de conservación, DD16/R10)', () => {
  it('antes del margen puede seguir en false; a partir de él debe ser true', () => {
    const margenAunNoAlcanzado = Date.now() < FECHA_TRIPWIRE;

    expect(margenAunNoAlcanzado || RENOVACION_PERFIL_IMPLEMENTADA).toBe(true);
  });
});

describe('PLAZO_CONSERVACION_ANIOS', () => {
  it('son 3 años desde la última confirmación (DD16)', () => {
    expect(PLAZO_CONSERVACION_ANIOS).toBe(3);
  });
});
