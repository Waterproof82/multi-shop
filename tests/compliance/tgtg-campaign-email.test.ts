/**
 * Contenido del email de campaña TooGoodToGo.
 *
 * POR QUÉ ESTE TEST EXISTE
 * La ruta que envía estas campañas tenía complejidad 50. Al descomponerla, la
 * pieza que más merecía prueba propia no era la más larga sino `resolverBaseUrl`:
 * el dominio de la empresa se incrusta en los `href` del correo que sale a
 * cientos de clientes. Un valor manipulado ahí es inyección de HTML en un correo
 * firmado con el nombre del restaurante.
 *
 * Lo demás —asunto, texto plano, enlaces— se prueba porque son las partes que
 * el cliente ve, y porque un correo mal formado no da error en ningún sitio:
 * simplemente nadie reserva.
 */
import { describe, it, expect } from 'vitest';
import {
  construirAsunto,
  construirTextoPlano,
  construirUrlBaja,
  construirUrlReserva,
  resolverBaseUrl,
  type CampanaParaEmail,
} from '../../src/lib/tgtg/campaign-email';

const ORIGEN = 'https://app.ejemplo.com';

describe('resolverBaseUrl — barrera contra inyección en los enlaces', () => {
  it('usa el dominio de la empresa cuando es un hostname válido', () => {
    expect(resolverBaseUrl('mirestaurante.es', ORIGEN)).toBe('https://mirestaurante.es');
    expect(resolverBaseUrl('sub.dominio.co.uk', ORIGEN)).toBe('https://sub.dominio.co.uk');
  });

  it('cae al origen de la petición si no hay dominio', () => {
    expect(resolverBaseUrl(null, ORIGEN)).toBe(ORIGEN);
    expect(resolverBaseUrl(undefined, ORIGEN)).toBe(ORIGEN);
    expect(resolverBaseUrl('', ORIGEN)).toBe(ORIGEN);
  });

  it('rechaza cualquier cosa que pueda romper el atributo href', () => {
    // Todos estos, sin la comprobación, acabarían dentro de un href del correo.
    const maliciosos = [
      'evil.com" onmouseover="alert(1)',
      'evil.com/><script>alert(1)</script>',
      "evil.com' onclick='x",
      'javascript:alert(1)',
      'evil.com ',
      ' evil.com',
      'evil.com/path',
      'evil.com?a=b',
    ];

    for (const dominio of maliciosos) {
      expect(resolverBaseUrl(dominio, ORIGEN), `debería rechazar ${JSON.stringify(dominio)}`).toBe(ORIGEN);
    }
  });

  it('rechaza hostnames sin punto o sin TLD razonable', () => {
    expect(resolverBaseUrl('localhost', ORIGEN)).toBe(ORIGEN);
    expect(resolverBaseUrl('empresa.x', ORIGEN)).toBe(ORIGEN);
    expect(resolverBaseUrl('.empresa.es', ORIGEN)).toBe(ORIGEN);
  });
});

const campana = (extra: Partial<CampanaParaEmail> = {}): CampanaParaEmail => ({
  promoId: 'promo-1',
  horaInicio: '19:00',
  horaFin: '20:30',
  fechaActivacion: '2026-08-05',
  items: [],
  ...extra,
});

describe('asunto del correo', () => {
  it('una sola campaña anuncia su horario de recogida', () => {
    expect(construirAsunto('es', [campana()])).toContain('19:00–20:30');
  });

  it('varias campañas anuncian cuántas hay, no el horario', () => {
    const asunto = construirAsunto('es', [campana(), campana({ promoId: 'p2' })]);

    expect(asunto).toContain('2');
    expect(asunto).not.toContain('19:00');
  });

  it('respeta el idioma del destinatario', () => {
    expect(construirAsunto('en', [campana()])).toContain('Pickup');
    expect(construirAsunto('fr', [campana()])).toContain('Retrait');
    expect(construirAsunto('de', [campana()])).toContain('Abholung');
  });

  it('cae al español ante un idioma que no se cubre', () => {
    // Preferible a mandar un asunto vacío, que es lo que haría un acceso directo.
    expect(construirAsunto('pt', [campana()])).toContain('Recogida');
  });
});

describe('texto plano', () => {
  const textos = { title: '¡Ofertas de hoy!', pickupTime: 'Recogida', disponible: 'disponibles' };

  it('incluye el enlace de reserva de cada ítem', () => {
    // Quien bloquea HTML solo ve esto: sin los enlaces, el correo no sirve.
    const plano = construirTextoPlano({
      empresaNombre: 'Bar Manolo',
      campanas: [campana({ items: [
        { titulo: 'Cesta sorpresa', precioDescuento: 4.5, cuponesDisponibles: 3, reservaUrl: 'https://x/1' },
        { titulo: 'Pack dulce', precioDescuento: 3, cuponesDisponibles: 1, reservaUrl: 'https://x/2' },
      ] })],
      textos, locale: 'es-ES',
      urlBaja: 'https://x/baja',
    });

    expect(plano).toContain('https://x/1');
    expect(plano).toContain('https://x/2');
    expect(plano).toContain('https://x/baja');
  });

  it('formatea el precio siempre con dos decimales', () => {
    const plano = construirTextoPlano({
      empresaNombre: 'Bar', locale: 'es-ES', textos, urlBaja: 'u',
      campanas: [campana({ items: [{ titulo: 'X', precioDescuento: '4', cuponesDisponibles: 1 }] })],
    });

    expect(plano).toContain('€4.00');
  });

  it('encabeza con el nombre del negocio', () => {
    const plano = construirTextoPlano({
      empresaNombre: 'Bar Manolo', campanas: [campana()], textos, locale: 'es-ES', urlBaja: 'u',
    });

    expect(plano.split('\n')[0]).toContain('Bar Manolo');
  });
});

describe('construcción de URLs', () => {
  it('codifica todos los parámetros del enlace de reserva', () => {
    // Un `&` sin codificar en el email partiría la URL y el enlace llevaría a
    // otra reserva, o a ninguna.
    const url = construirUrlReserva({
      baseUrl: 'https://x', itemId: 'i&1', promoId: 'p 1',
      email: 'a+b@c.com', token: 'tok/en=', lang: 'es',
    });

    const params = new URL(url).searchParams;
    expect(params.get('itemId')).toBe('i&1');
    expect(params.get('promoId')).toBe('p 1');
    expect(params.get('email')).toBe('a+b@c.com');
    expect(params.get('token')).toBe('tok/en=');
  });

  it('codifica el email en el enlace de baja', () => {
    const url = construirUrlBaja('https://x', 'a+b@c.com', 'emp-1');

    expect(new URL(url).searchParams.get('email')).toBe('a+b@c.com');
    expect(new URL(url).searchParams.get('action')).toBe('baja');
  });
});
