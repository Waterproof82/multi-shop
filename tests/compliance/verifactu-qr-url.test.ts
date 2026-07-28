/**
 * Vitest — VeriFactu QR URL (RD 1007/2023 Art. 12 — No-VeriFactu mode)
 *
 * Verifica la estructura de la URL AEAT replicando la lógica de
 * tpv_cobro_before_insert() paso 4 (migración 20260729000002).
 *
 * numserie: {serie}{numero_6digits} SIN guión (Anexo II ValidarQR spec AEAT)
 * fecha:    DD-MM-YYYY  (formato AEAT — diferente al ISO 8601)
 * importe:  FM999999990.00 (punto decimal, siempre 2 decimales)
 */
import { describe, it, expect } from 'vitest';

/** Replica de la lógica SQL: tpv_cobro_before_insert() paso 4 */
function buildVerifactuQrUrl(params: {
  nif: string | null;
  serie: string;
  numeroTicket: number;
  cobradoAt: Date;
  importeCobradoCents: number;
}): string | null {
  const { nif, serie, numeroTicket, cobradoAt, importeCobradoCents } = params;
  if (nif === null) return null;

  // numserie: serie + lpad(numero_ticket, 6, '0') — SIN guión (Anexo II RD 1007/2023)
  const numserie = serie + String(numeroTicket).padStart(6, '0');

  // fecha: DD-MM-YYYY (to_char ... 'DD-MM-YYYY')
  const dd    = String(cobradoAt.getUTCDate()).padStart(2, '0');
  const mm    = String(cobradoAt.getUTCMonth() + 1).padStart(2, '0');
  const yyyy  = cobradoAt.getUTCFullYear();
  const fecha = `${dd}-${mm}-${yyyy}`;

  // importe: FM999999990.00 → 2 decimales fijos, sin ceros de relleno a la izquierda
  const importe = (importeCobradoCents / 100).toFixed(2);

  return (
    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR' +
    `?nif=${nif}` +
    `&numserie=${numserie}` +
    `&fecha=${fecha}` +
    `&importe=${importe}`
  );
}

const BASE = {
  nif: 'B12345678',
  serie: 'T',
  numeroTicket: 42,
  cobradoAt: new Date('2026-07-29T10:30:00Z'),
  importeCobradoCents: 2150, // 21.50 €
};

describe('VeriFactu QR URL — No-VeriFactu mode (RD 1007/2023 Art. 12)', () => {
  // ── numserie ───────────────────────────────────────────────────────────────

  it('numserie: serie + 6 dígitos SIN guión (T000042)', () => {
    const url = buildVerifactuQrUrl(BASE);
    expect(url).toContain('&numserie=T000042');
  });

  it('numserie: ticket 1 → T000001', () => {
    const url = buildVerifactuQrUrl({ ...BASE, numeroTicket: 1 });
    expect(url).toContain('&numserie=T000001');
  });

  it('numserie: ticket 999999 → T999999 (máximo sin overflow)', () => {
    const url = buildVerifactuQrUrl({ ...BASE, numeroTicket: 999999 });
    expect(url).toContain('&numserie=T999999');
  });

  it('numserie NO contiene guión (formato AEAT Anexo II)', () => {
    const url = buildVerifactuQrUrl(BASE)!;
    const numserieMatch = url.match(/numserie=([^&]+)/);
    expect(numserieMatch).not.toBeNull();
    expect(numserieMatch![1]).not.toContain('-');
  });

  // ── fecha ──────────────────────────────────────────────────────────────────

  it('fecha en formato DD-MM-YYYY (29-07-2026)', () => {
    const url = buildVerifactuQrUrl(BASE);
    expect(url).toContain('&fecha=29-07-2026');
  });

  it('fecha NO está en formato ISO 8601 (no debe contener 2026-07-29)', () => {
    const url = buildVerifactuQrUrl(BASE);
    expect(url).not.toContain('2026-07-29');
  });

  it('fecha: día y mes con cero inicial (01-01-2026)', () => {
    const url = buildVerifactuQrUrl({
      ...BASE,
      cobradoAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(url).toContain('&fecha=01-01-2026');
  });

  // ── importe ────────────────────────────────────────────────────────────────

  it('importe: 2150 cents → 21.50 (punto decimal, 2 decimales)', () => {
    const url = buildVerifactuQrUrl(BASE);
    expect(url).toContain('&importe=21.50');
  });

  it('importe: 0 cents → 0.00', () => {
    const url = buildVerifactuQrUrl({ ...BASE, importeCobradoCents: 0 });
    expect(url).toContain('&importe=0.00');
  });

  it('importe: entero sin centavos → siempre 2 decimales (100.00)', () => {
    const url = buildVerifactuQrUrl({ ...BASE, importeCobradoCents: 10000 });
    expect(url).toContain('&importe=100.00');
  });

  it('importe: 1 cent → 0.01', () => {
    const url = buildVerifactuQrUrl({ ...BASE, importeCobradoCents: 1 });
    expect(url).toContain('&importe=0.01');
  });

  // ── URL base ───────────────────────────────────────────────────────────────

  it('URL base apunta a AEAT ValidarQR', () => {
    const url = buildVerifactuQrUrl(BASE);
    expect(url).toMatch(
      /^https:\/\/www2\.agenciatributaria\.gob\.es\/wlpl\/TIKE-CONT\/ValidarQR\?/,
    );
  });

  it('orden de params: nif → numserie → fecha → importe (spec AEAT)', () => {
    const url = buildVerifactuQrUrl(BASE)!;
    const nifIdx      = url.indexOf('nif=');
    const numserieIdx = url.indexOf('numserie=');
    const fechaIdx    = url.indexOf('fecha=');
    const importeIdx  = url.indexOf('importe=');
    expect(nifIdx).toBeLessThan(numserieIdx);
    expect(numserieIdx).toBeLessThan(fechaIdx);
    expect(fechaIdx).toBeLessThan(importeIdx);
  });

  // ── NIF null ───────────────────────────────────────────────────────────────

  it('NIF null → URL null (empresa IGIC o sin NIF en test)', () => {
    const url = buildVerifactuQrUrl({ ...BASE, nif: null });
    expect(url).toBeNull();
  });

  it('NIF presente → URL no es null', () => {
    const url = buildVerifactuQrUrl(BASE);
    expect(url).not.toBeNull();
  });
});
