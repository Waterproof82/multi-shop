import { describe, it, expect } from 'vitest';
import { formularioValido } from '@/app/admin/(protected)/kits/lotes/lote-caducidades-editor';

// R-M4.3.2/DD9: cada fila lleva exactamente una fuente de fecha (línea de
// albarán xor fecha manual + parte). Un payload con ambas o ninguna no debe
// poder enviarse — mismo refine que `replaceCaducidadesSchema` en Zod.
const FILA_BASE = { ingredienteId: 'ing-1', parte: '', albaranCompraItemId: null as string | null, caducaEl: null as string | null };

describe('formularioValido — XOR del editor de caducidades', () => {
  it('rechaza una fila con ambas fuentes', () => {
    const rows = [{ ...FILA_BASE, albaranCompraItemId: 'item-1', caducaEl: '2027-01-01', parte: 'botiquín' }];
    expect(formularioValido(rows)).toBe(false);
  });

  it('rechaza una fila sin ninguna fuente', () => {
    expect(formularioValido([FILA_BASE])).toBe(false);
  });

  it('acepta una línea de albarán como única fuente', () => {
    const rows = [{ ...FILA_BASE, albaranCompraItemId: 'item-1' }];
    expect(formularioValido(rows)).toBe(true);
  });

  it('acepta una fecha manual con parte no vacía', () => {
    const rows = [{ ...FILA_BASE, caducaEl: '2027-01-01', parte: 'botiquín' }];
    expect(formularioValido(rows)).toBe(true);
  });

  it('rechaza una fecha manual sin parte', () => {
    const rows = [{ ...FILA_BASE, caducaEl: '2027-01-01', parte: '' }];
    expect(formularioValido(rows)).toBe(false);
  });

  it('rechaza un (ingredienteId, parte) duplicado entre filas', () => {
    const rows = [
      { ...FILA_BASE, caducaEl: '2027-01-01', parte: 'botiquín' },
      { ...FILA_BASE, caducaEl: '2027-06-01', parte: 'botiquín' },
    ];
    expect(formularioValido(rows)).toBe(false);
  });

  it('rechaza un formulario sin filas', () => {
    expect(formularioValido([])).toBe(false);
  });
});
