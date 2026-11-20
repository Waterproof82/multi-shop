import { describe, expect, it } from 'vitest';
import { generarCodigoChapa, normalizarCodigoChapa, esCodigoChapaValido } from '@/lib/pet-id/codigo';
import { generarSerie, esSerieValida } from '@/lib/kit-caducidad/serie';

// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// R-QR.2.1/DD2: la chapa de mascota reutiliza `crearFormatoCodigo('M')`
// (generalización de `kit-caducidad/serie.ts`) — mismo CSPRNG de 40 bits,
// alfabeto Crockford y dígito de control, con el prefijo `M` en vez de
// `KEC`, para que un código de mascota nunca se confunda con una serie de
// kit.

const bytes = (...valores: number[]) => () => Uint8Array.from(valores);

describe('generarCodigoChapa', () => {
  it('produce el formato M-XXXX-XXXX-C con alfabeto Crockford', () => {
    const codigo = generarCodigoChapa(bytes(0x12, 0x34, 0x56, 0x78, 0x9a));

    expect(codigo).toMatch(/^M-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$/);
  });

  it('es determinista para los mismos bytes y válido', () => {
    const codigo = generarCodigoChapa(bytes(0, 0, 0, 0, 1));

    expect(codigo).toBe(generarCodigoChapa(bytes(0, 0, 0, 0, 1)));
    expect(esCodigoChapaValido(codigo)).toBe(true);
  });
});

describe('esCodigoChapaValido', () => {
  it('detecta un carácter cambiado', () => {
    const valido = generarCodigoChapa(bytes(0xde, 0xad, 0xbe, 0xef, 0x42));
    const cuerpo = valido.slice(2, 6);
    const cambiado = cuerpo[0] === '0' ? '1' : '0';
    const erroneo = `M-${cambiado}${cuerpo.slice(1)}${valido.slice(6)}`;

    expect(esCodigoChapaValido(erroneo)).toBe(false);
  });

  it('rechaza basura, longitudes erróneas y prefijos ajenos', () => {
    expect(esCodigoChapaValido('')).toBe(false);
    expect(esCodigoChapaValido('M-1234')).toBe(false);
    expect(esCodigoChapaValido('<script>')).toBe(false);
  });
});

describe('normalizarCodigoChapa', () => {
  it('acepta minúsculas, espacios y las confusiones O/0 e I/L/1 de Crockford', () => {
    const codigo = generarCodigoChapa(bytes(1, 2, 3, 4, 5));
    const escrito = codigo.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o').replaceAll('1', 'l');

    expect(normalizarCodigoChapa(escrito)).toBe(codigo);
  });

  it('devuelve null si no tiene forma de código de chapa', () => {
    expect(normalizarCodigoChapa('hola')).toBeNull();
  });
});

// Escenario (spec R-QR.2.1): prefijo distinto. Cuando se genera un código
// de chapa y un código de kit con el mismo generador, sus prefijos son
// distintos y no hay colisión posible entre espacios de nombres.
describe('no colisión entre prefijos de mascota y de kit', () => {
  it('un código de chapa nunca es una serie de kit válida, ni al revés', () => {
    const codigoChapa = generarCodigoChapa(bytes(3, 3, 3, 3, 3));
    const serieKit = generarSerie(bytes(4, 4, 4, 4, 4));

    expect(codigoChapa.startsWith('M-')).toBe(true);
    expect(serieKit.startsWith('KEC-')).toBe(true);
    expect(esSerieValida(codigoChapa)).toBe(false);
    expect(esCodigoChapaValido(serieKit)).toBe(false);
  });
});
