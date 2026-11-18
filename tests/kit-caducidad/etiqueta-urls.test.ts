import { describe, expect, it } from 'vitest';
import { urlEstadoKit, URL_LISTA_MOCHILA } from '@/lib/kit-caducidad/etiqueta-urls';
import { generarSerie } from '@/lib/kit-caducidad/serie';

// sdd kit-expiry-m5 R-M5.2.2/DD9: las URL de la etiqueta salen de funciones
// puras; la del QR 1 exige `esSerieValida(serie)` — sin normalizar, porque
// quien la llama ya tiene la forma canónica guardada en BD.

const bytes = (...valores: number[]) => () => Uint8Array.from(valores);
const serieValida = generarSerie(bytes(0x12, 0x34, 0x56, 0x78, 0x9a));

describe('urlEstadoKit', () => {
  it('construye la URL de estado a partir de una serie válida', () => {
    expect(urlEstadoKit(serieValida)).toBe(`https://pedidos.kitemergenciacanarias.es/kit/${serieValida}`);
  });

  it('devuelve null si el carácter de control no cuadra', () => {
    const cuerpo = serieValida.slice(4, 8);
    const cambiado = cuerpo[0] === '0' ? '1' : '0';
    const erronea = `KEC-${cambiado}${cuerpo.slice(1)}${serieValida.slice(8)}`;

    expect(urlEstadoKit(erronea)).toBeNull();
  });

  it('devuelve null si la serie no está normalizada (minúsculas)', () => {
    expect(urlEstadoKit(serieValida.toLowerCase())).toBeNull();
  });

  it('devuelve null para una serie vacía', () => {
    expect(urlEstadoKit('')).toBeNull();
  });
});

describe('URL_LISTA_MOCHILA', () => {
  it('es la URL fija de la lista de la mochila de emergencia', () => {
    expect(URL_LISTA_MOCHILA).toBe('https://kitemergenciacanarias.es/lista-mochila-emergencia');
  });
});
