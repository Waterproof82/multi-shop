import { describe, expect, it } from 'vitest';
import { construirCsvChapas } from '@/lib/pet-id/csv';
import type { EtiquetaChapa } from '@/core/domain/entities/pet-chapa-types';

// sdd pet-id-qr-profile, Fase 8 (R-QR.14.3): CSV `codigo,url` para que el
// proveedor imprima con datos variables. Ninguna celda puede empezar por
// `= + - @` (inyección de fórmula si se abre en Excel/Sheets) — aunque los
// códigos los genera el servidor (nunca con esos caracteres), la función es
// defensiva por si algún día una URL/código llega de otro origen.

function etiqueta(codigo: string, url: string): EtiquetaChapa {
  return { codigo, url };
}

describe('construirCsvChapas', () => {
  it('cabecera codigo,url y una fila por etiqueta', () => {
    const csv = construirCsvChapas([
      etiqueta('M-AAAA-1111-X', 'https://pedidos.kitemergenciacanarias.es/m/M-AAAA-1111-X'),
      etiqueta('M-BBBB-2222-Y', 'https://pedidos.kitemergenciacanarias.es/m/M-BBBB-2222-Y'),
    ]);

    const lineas = csv.trim().split('\r\n');
    expect(lineas[0]).toBe('codigo,url');
    expect(lineas[1]).toBe('M-AAAA-1111-X,https://pedidos.kitemergenciacanarias.es/m/M-AAAA-1111-X');
    expect(lineas[2]).toBe('M-BBBB-2222-Y,https://pedidos.kitemergenciacanarias.es/m/M-BBBB-2222-Y');
  });

  it('una lista vacía produce solo la cabecera', () => {
    expect(construirCsvChapas([]).trim()).toBe('codigo,url');
  });

  it('ninguna celda empieza por = + - @ (R-QR.14.3): se antepone una comilla simple', () => {
    const peligrosas = ['=SUMA(A1)', '+1', '-1', '@SUMA(A1)'];
    for (const valor of peligrosas) {
      const csv = construirCsvChapas([etiqueta(valor, valor)]);
      const fila = csv.trim().split('\r\n')[1];
      for (const celda of fila.split(',')) {
        expect(/^[=+\-@]/.test(celda)).toBe(false);
      }
    }
  });

  it('un valor sin prefijo peligroso no se modifica', () => {
    const csv = construirCsvChapas([etiqueta('M-AAAA-1111-X', 'https://pedidos.kitemergenciacanarias.es/m/M-AAAA-1111-X')]);
    expect(csv).not.toContain("'M-AAAA-1111-X");
  });
});
