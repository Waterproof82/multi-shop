import { describe, expect, it } from 'vitest';
import { hoyEnCanarias } from '@/lib/kit-caducidad/hoy-canarias';

// sdd kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), DD9 de design.md
// REVISADO en sdd-apply (2026-11-18): `Atlantic/Canary`, no `Europe/Madrid`
// (D-M2a-4 revisada) — los clientes del kit están en Canarias, que NO
// comparte huso con la península: WET (UTC+0) en invierno, WEST (UTC+1) en
// verano, un desfase de 1h menos que Madrid (CET/CEST) todo el año.

describe('hoyEnCanarias', () => {
  it('invierno (WET, UTC+0): a las 23:30Z del 31 de diciembre AÚN es 31 de diciembre', () => {
    // Punto que pedía confirmar el propietario: a diferencia de Madrid
    // (CET = UTC+1), donde 23:30Z ya es el día siguiente, en Canarias el
    // día natural solo cambia a las 00:00Z.
    expect(hoyEnCanarias(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });

  it('invierno (WET, UTC+0): el cambio de día cae exactamente a las 00:00Z', () => {
    expect(hoyEnCanarias(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-31');
    expect(hoyEnCanarias(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01-01');
  });

  it('verano (WEST, UTC+1): el cambio de día cae a las 23:00Z', () => {
    expect(hoyEnCanarias(new Date('2026-07-15T22:59:00Z'))).toBe('2026-07-15');
    expect(hoyEnCanarias(new Date('2026-07-15T23:00:00Z'))).toBe('2026-07-16');
  });

  it('el formato es siempre YYYY-MM-DD', () => {
    expect(hoyEnCanarias(new Date('2026-03-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('usa `new Date()` por defecto cuando no se inyecta nada', () => {
    expect(hoyEnCanarias()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
