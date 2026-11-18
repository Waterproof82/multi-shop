// sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), R-M2b.5: ninguno
// de los dos emails es comercial (no llevan enlace de compra), llevan
// remitente identificable (art. 20.1) y revocación (art. 22.1).
import { describe, expect, it } from 'vitest';
import { emailConfirmacion, emailGestion, remitenteDe } from '@/lib/kit-caducidad/emails-avisos';

const REMITENTE_COMPLETO = { nombre: 'Kit Emergencia Canarias SL', nif: 'B12345678', direccion: 'Calle Falsa 1, Santa Cruz', email: 'contacto@kitemergenciacanarias.es' };

function datos(overrides: Partial<Parameters<typeof emailConfirmacion>[0]> = {}) {
  return {
    serie: 'KEC-ABCD-1234-5',
    token: 'a'.repeat(43),
    baseUrl: 'https://tienda.kitemergenciacanarias.es',
    remitente: REMITENTE_COMPLETO,
    ...overrides,
  };
}

const PROHIBIDOS = ['pack-recambio', 'comprar', '?kit='];

describe('remitenteDe', () => {
  it('con email y NIF devuelve el remitente', () => {
    const titular = { nombre: 'Kit Emergencia Canarias SL', nif: 'B12345678', direccion: null, email: 'contacto@kitemergenciacanarias.es' };
    expect(remitenteDe(titular)).toEqual({
      nombre: 'Kit Emergencia Canarias SL',
      nif: 'B12345678',
      direccion: null,
      email: 'contacto@kitemergenciacanarias.es',
    });
  });

  it('sin email devuelve null', () => {
    expect(remitenteDe({ nombre: 'X', nif: 'B1', direccion: null, email: null })).toBeNull();
  });

  it('sin NIF devuelve null', () => {
    expect(remitenteDe({ nombre: 'X', nif: null, direccion: null, email: 'a@b.com' })).toBeNull();
  });
});

describe('emailConfirmacion', () => {
  it('el asunto es "Confirma tus avisos del kit"', () => {
    expect(emailConfirmacion(datos()).asunto).toBe('Confirma tus avisos del kit');
  });

  it('html y texto llevan la serie, el enlace de gestión, el titular y "o escribe a"', () => {
    const { html, texto } = emailConfirmacion(datos());
    for (const parte of [html, texto]) {
      expect(parte).toContain('KEC-ABCD-1234-5');
      expect(parte).toContain(`https://tienda.kitemergenciacanarias.es/kit/avisos/${'a'.repeat(43)}`);
      expect(parte).toContain('Kit Emergencia Canarias SL');
      expect(parte).toContain('B12345678');
      expect(parte).toContain('contacto@kitemergenciacanarias.es');
      expect(parte).toContain('o escribe a');
    }
  });

  it('avisa de que caduca en 48 horas y de que se ignore si no fue el titular', () => {
    const { html, texto } = emailConfirmacion(datos());
    for (const parte of [html, texto]) {
      expect(parte).toContain('48 horas');
      expect(parte).toContain('Si no lo has pedido tú');
    }
  });

  it('recuerda qué se ha pedido (30 y 15 días) sin repetir la cláusula de compra del recambio', () => {
    const { html, texto } = emailConfirmacion(datos());
    for (const parte of [html, texto]) {
      expect(parte).toContain('30 y 15 días');
    }
  });

  it('no contiene pack-recambio, comprar ni ?kit=', () => {
    const { html, texto } = emailConfirmacion(datos());
    for (const parte of [html, texto]) {
      for (const prohibido of PROHIBIDOS) {
        expect(parte.toLowerCase()).not.toContain(prohibido);
      }
    }
  });

  it('un nombre de titular con <script> sale escapado en el html', () => {
    const { html } = emailConfirmacion(
      datos({ remitente: { ...REMITENTE_COMPLETO, nombre: '<script>alert(1)</script>' } }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('emailGestion', () => {
  it('motivo "intento": dice que alguien ha intentado registrar avisos y que no se ha cambiado nada', () => {
    const { html, texto } = emailGestion(datos(), 'intento');
    for (const parte of [html, texto]) {
      expect(parte).toContain('Alguien ha intentado registrar avisos para tu kit');
      expect(parte).toContain('KEC-ABCD-1234-5');
      expect(parte).toContain('No hemos cambiado nada');
    }
  });

  it('motivo "solicitud": dice que aquí va el enlace para gestionar los avisos', () => {
    const { html, texto } = emailGestion(datos(), 'solicitud');
    for (const parte of [html, texto]) {
      expect(parte).toContain('Aquí tienes el enlace para gestionar tus avisos');
    }
  });

  it('los dos motivos llevan el enlace de gestión y "o escribe a"', () => {
    for (const motivo of ['intento', 'solicitud'] as const) {
      const { html, texto } = emailGestion(datos(), motivo);
      for (const parte of [html, texto]) {
        expect(parte).toContain(`https://tienda.kitemergenciacanarias.es/kit/avisos/${'a'.repeat(43)}`);
        expect(parte).toContain('o escribe a');
      }
    }
  });

  it('no contiene pack-recambio, comprar ni ?kit=', () => {
    for (const motivo of ['intento', 'solicitud'] as const) {
      const { html, texto } = emailGestion(datos(), motivo);
      for (const parte of [html, texto]) {
        for (const prohibido of PROHIBIDOS) {
          expect(parte.toLowerCase()).not.toContain(prohibido);
        }
      }
    }
  });

  it('un nombre de titular con <script> sale escapado en el html', () => {
    const { html } = emailGestion(
      datos({ remitente: { ...REMITENTE_COMPLETO, nombre: '<script>alert(1)</script>' } }),
      'solicitud',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
