import { describe, expect, it } from 'vitest';
import {
  urlEstadoKit,
  URL_LISTA_MOCHILA,
  urlPackRecambio,
  URL_PACK_RECAMBIO,
  URL_TIENDA_KEC,
  urlBajaUnClic,
} from '@/lib/kit-caducidad/etiqueta-urls';
import { generarSerie } from '@/lib/kit-caducidad/serie';
import { generarTokenGestion } from '@/lib/kit-caducidad/token-gestion';

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

// sdd kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), R-M2a.2.5/D-M2a-7:
// el recambio lleva `?kit={slug}` solo con un slug válido
// (`^[a-z0-9-]{1,100}$`) — sin slug válido, la URL va sin el parámetro (no
// se rompe el enlace, solo pierde el preseleccionado).
describe('urlPackRecambio', () => {
  it('añade ?kit= con un slug válido', () => {
    expect(urlPackRecambio('kit-estandar-72h')).toBe(
      'https://kitemergenciacanarias.es/kits-de-emergencia/pack-recambio-consumibles?kit=kit-estandar-72h',
    );
  });

  it('va sin ?kit= con null', () => {
    expect(urlPackRecambio(null)).toBe(URL_PACK_RECAMBIO);
  });

  it('va sin ?kit= con una cadena vacía', () => {
    expect(urlPackRecambio('')).toBe(URL_PACK_RECAMBIO);
  });

  it('va sin ?kit= si el slug intenta salir de la ruta (../)', () => {
    expect(urlPackRecambio('../x')).toBe(URL_PACK_RECAMBIO);
  });

  it('va sin ?kit= si el slug lleva mayúsculas', () => {
    expect(urlPackRecambio('Kit')).toBe(URL_PACK_RECAMBIO);
  });

  it('va sin ?kit= si el slug supera los 100 caracteres', () => {
    expect(urlPackRecambio('a'.repeat(101))).toBe(URL_PACK_RECAMBIO);
  });

  it('acepta un slug de exactamente 100 caracteres', () => {
    const slug = 'a'.repeat(100);
    expect(urlPackRecambio(slug)).toBe(`${URL_PACK_RECAMBIO}?kit=${slug}`);
  });
});

describe('URL_PACK_RECAMBIO', () => {
  it('es la URL fija del pack de recambio de consumibles', () => {
    expect(URL_PACK_RECAMBIO).toBe('https://kitemergenciacanarias.es/kits-de-emergencia/pack-recambio-consumibles');
  });
});

// sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3b/DD6/DD7: la
// baja de un clic (RFC 8058) la recibe la tienda, no la web de marketing.
describe('URL_TIENDA_KEC', () => {
  it('es la URL fija de la tienda', () => {
    expect(URL_TIENDA_KEC).toBe('https://pedidos.kitemergenciacanarias.es');
  });
});

describe('urlBajaUnClic', () => {
  it('construye la URL de baja de un clic a partir de un token de gestión válido', () => {
    const token = generarTokenGestion();

    expect(urlBajaUnClic(token)).toBe(`https://pedidos.kitemergenciacanarias.es/api/kit-avisos/baja/${token}`);
  });

  it('lanza con un token que no cumple esTokenGestion', () => {
    expect(() => urlBajaUnClic('no-es-un-token-valido')).toThrow();
  });
});
