import { describe, it, expect } from 'vitest';
import { loteChapaFormValido } from '@/app/admin/(protected)/mascotas/lotes/page';
import { cantidadCodigosChapaValida, bloquesEtiquetasChapa } from '@/app/admin/(protected)/mascotas/lotes/lote-chapas-panel';
import { codigoBorrarValido } from '@/app/admin/(protected)/mascotas/lotes/borrar-datos-chapa';

// sdd pet-id-qr-profile, Fase 7 (admin UI) — reglas puras extraídas de los
// formularios, mismo patrón que `kit-caducidades-editor-xor.test.tsx` y
// `cantidadValida` de `series-lote.tsx`: nunca se monta el componente, solo
// se prueba la regla.

describe('loteChapaFormValido — alta de lote', () => {
  it('rechaza sin producto', () => {
    expect(loteChapaFormValido('', 'L01')).toBe(false);
  });

  it('rechaza un código vacío o solo espacios', () => {
    expect(loteChapaFormValido('producto-1', '   ')).toBe(false);
  });

  it('acepta producto y código no vacíos', () => {
    expect(loteChapaFormValido('producto-1', 'L01')).toBe(true);
  });
});

describe('cantidadCodigosChapaValida — generación de códigos (R-QR.1.1)', () => {
  it('rechaza 0', () => {
    expect(cantidadCodigosChapaValida(0)).toBe(false);
  });

  it('rechaza más de 500', () => {
    expect(cantidadCodigosChapaValida(501)).toBe(false);
  });

  it('rechaza un decimal', () => {
    expect(cantidadCodigosChapaValida(1.5)).toBe(false);
  });

  it('acepta 1 y 500', () => {
    expect(cantidadCodigosChapaValida(1)).toBe(true);
    expect(cantidadCodigosChapaValida(500)).toBe(true);
  });
});

describe('bloquesEtiquetasChapa — descarga de etiquetas PDF (Fase 8)', () => {
  it('sin chapas, igualmente devuelve 1 bloque (desactivado en la UI, no en el cálculo)', () => {
    expect(bloquesEtiquetasChapa(0)).toBe(1);
  });

  it('con menos de 500 chapas, 1 bloque', () => {
    expect(bloquesEtiquetasChapa(1)).toBe(1);
    expect(bloquesEtiquetasChapa(500)).toBe(1);
  });

  it('con 501 chapas, 2 bloques', () => {
    expect(bloquesEtiquetasChapa(501)).toBe(2);
  });

  it('con 1200 chapas, 3 bloques', () => {
    expect(bloquesEtiquetasChapa(1200)).toBe(3);
  });
});

describe('codigoBorrarValido — borrado auditado (R-QR.1.3)', () => {
  it('rechaza vacío o solo espacios', () => {
    expect(codigoBorrarValido('')).toBe(false);
    expect(codigoBorrarValido('   ')).toBe(false);
  });

  it('acepta un código no vacío', () => {
    expect(codigoBorrarValido('M-AAAA-1111-X')).toBe(true);
  });
});
