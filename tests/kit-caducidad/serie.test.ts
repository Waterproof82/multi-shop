import { describe, expect, it } from 'vitest';
import { generarSerie, normalizarSerie, esSerieValida, crearFormatoCodigo } from '@/lib/kit-caducidad/serie';

// sdd kit-expiry-reminders R3.1 (kitemergenciacanarias): KEC-XXXX-XXXX-C,
// Crockford base32, 40 bits aleatorios y un carácter de control.

const bytes = (...valores: number[]) => () => Uint8Array.from(valores);

describe('generarSerie', () => {
  it('produce el formato KEC-XXXX-XXXX-C con alfabeto Crockford', () => {
    // Arrange
    const aleatorio = bytes(0x12, 0x34, 0x56, 0x78, 0x9a);

    // Act
    const serie = generarSerie(aleatorio);

    // Assert
    expect(serie).toMatch(/^KEC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$/);
  });

  it('es determinista para los mismos bytes y válida', () => {
    const serie = generarSerie(bytes(0, 0, 0, 0, 1));

    expect(serie).toBe(generarSerie(bytes(0, 0, 0, 0, 1)));
    expect(esSerieValida(serie)).toBe(true);
  });

  it('pide exactamente 5 bytes (40 bits) al generador', () => {
    let pedidos = 0;
    generarSerie((n) => {
      pedidos = n;
      return new Uint8Array(n);
    });

    expect(pedidos).toBe(5);
  });
});

describe('esSerieValida', () => {
  const valida = generarSerie(bytes(0xde, 0xad, 0xbe, 0xef, 0x42));

  it('detecta un carácter cambiado', () => {
    const cuerpo = valida.slice(4, 8);
    const cambiado = cuerpo[0] === '0' ? '1' : '0';
    const erronea = `KEC-${cambiado}${cuerpo.slice(1)}${valida.slice(8)}`;

    expect(esSerieValida(erronea)).toBe(false);
  });

  it('detecta dos caracteres contiguos intercambiados', () => {
    const limpia = valida.replaceAll('-', '').slice(3);
    const i = [...limpia].findIndex((c, k) => k < 7 && c !== limpia[k + 1]);
    const swap = limpia.slice(0, i) + limpia[i + 1] + limpia[i] + limpia.slice(i + 2);

    expect(esSerieValida(`KEC${swap}`)).toBe(false);
  });

  it('rechaza basura, longitudes erróneas y prefijos ajenos', () => {
    expect(esSerieValida('')).toBe(false);
    expect(esSerieValida('KEC-1234')).toBe(false);
    expect(esSerieValida(valida.replace('KEC', 'ABC'))).toBe(false);
    expect(esSerieValida('<script>')).toBe(false);
  });
});

describe('normalizarSerie', () => {
  it('acepta minúsculas, espacios y las confusiones O/0 e I/L/1 de Crockford', () => {
    const serie = generarSerie(bytes(1, 2, 3, 4, 5));
    const escrita = serie.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o').replaceAll('1', 'l');

    expect(normalizarSerie(escrita)).toBe(serie);
  });

  it('devuelve null si no tiene forma de serie', () => {
    expect(normalizarSerie('hola')).toBeNull();
    expect(normalizarSerie('x'.repeat(500))).toBeNull();
  });
});

// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// DD2: `crearFormatoCodigo(prefijo)` generaliza este fichero para que las
// chapas de mascota (prefijo `M`) usen el mismo mecanismo que los kits
// (prefijo `KEC`) sin que sus espacios de nombres puedan colisionar.
describe('crearFormatoCodigo', () => {
  it('genera, con otro prefijo, el mismo formato PREFIJO-XXXX-XXXX-C', () => {
    const formatoM = crearFormatoCodigo('M');
    const aleatorio = bytes(0x12, 0x34, 0x56, 0x78, 0x9a);

    const codigo = formatoM.generar(aleatorio);

    expect(codigo).toMatch(/^M-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$/);
    expect(formatoM.esValido(codigo)).toBe(true);
  });

  it('normaliza y valida con un prefijo de más de una letra, igual que KEC', () => {
    const formatoAbc = crearFormatoCodigo('ABC');
    const codigo = formatoAbc.generar(bytes(1, 2, 3, 4, 5));

    expect(formatoAbc.esValido(codigo)).toBe(true);
    expect(formatoAbc.normalizar(codigo.toLowerCase().replaceAll('-', ' '))).toBe(codigo);
  });

  it('detecta un carácter cambiado con cualquier prefijo (no solo KEC)', () => {
    const formatoM = crearFormatoCodigo('M');
    const valido = formatoM.generar(bytes(0xde, 0xad, 0xbe, 0xef, 0x42));
    const cuerpo = valido.slice(2, 6);
    const cambiado = cuerpo[0] === '0' ? '1' : '0';
    const erroneo = `M-${cambiado}${cuerpo.slice(1)}${valido.slice(6)}`;

    expect(formatoM.esValido(erroneo)).toBe(false);
  });

  it('no deja colisionar dos prefijos distintos entre sí', () => {
    const formatoM = crearFormatoCodigo('M');
    const codigoKec = generarSerie(bytes(1, 1, 1, 1, 1));
    const codigoM = formatoM.generar(bytes(2, 2, 2, 2, 2));

    expect(formatoM.esValido(codigoKec)).toBe(false);
    expect(esSerieValida(codigoM)).toBe(false);
  });

  it('generarSerie/normalizarSerie/esSerieValida de KEC siguen sin regresión tras generalizar', () => {
    const serie = generarSerie(bytes(9, 8, 7, 6, 5));

    expect(serie).toMatch(/^KEC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$/);
    expect(esSerieValida(serie)).toBe(true);
    expect(normalizarSerie(serie.toLowerCase().replaceAll('-', ''))).toBe(serie);
  });
});
