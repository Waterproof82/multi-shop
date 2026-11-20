import { describe, expect, it } from 'vitest';
import { urlPerfilChapa, URL_TIENDA_MASCOTAS } from '@/lib/pet-id/urls';
import { generarCodigoChapa } from '@/lib/pet-id/codigo';

// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// R-QR.2.2/DD3: la URL del perfil debe ser lo más corta posible, para que
// el QR impreso en la chapa quepa en una versión baja. Con el dominio fijo
// `pedidos.kitemergenciacanarias.es` y la ruta `/m/{codigo}`, la URL
// completa no supera los 62 bytes (nivel de corrección M, versión 4 de QR).

const bytes = (...valores: number[]) => () => Uint8Array.from(valores);
const codigoValido = generarCodigoChapa(bytes(0x12, 0x34, 0x56, 0x78, 0x9a));

describe('urlPerfilChapa', () => {
  it('construye la URL del perfil a partir de un código válido', () => {
    expect(urlPerfilChapa(codigoValido)).toBe(`${URL_TIENDA_MASCOTAS}/m/${codigoValido}`);
  });

  it('la URL completa no supera los 62 bytes (DD3)', () => {
    const url = urlPerfilChapa(codigoValido) ?? '';

    expect(Buffer.byteLength(url, 'utf8')).toBeLessThanOrEqual(62);
  });

  it('devuelve null si el carácter de control no cuadra', () => {
    const cuerpo = codigoValido.slice(2, 6);
    const cambiado = cuerpo[0] === '0' ? '1' : '0';
    const erroneo = `M-${cambiado}${cuerpo.slice(1)}${codigoValido.slice(6)}`;

    expect(urlPerfilChapa(erroneo)).toBeNull();
  });

  it('devuelve null si el código no está normalizado (minúsculas)', () => {
    expect(urlPerfilChapa(codigoValido.toLowerCase())).toBeNull();
  });

  it('devuelve null para un código vacío', () => {
    expect(urlPerfilChapa('')).toBeNull();
  });
});

describe('URL_TIENDA_MASCOTAS', () => {
  it('es la URL fija de la tienda', () => {
    expect(URL_TIENDA_MASCOTAS).toBe('https://pedidos.kitemergenciacanarias.es');
  });
});
