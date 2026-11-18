// sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3c/R-M3.4: email
// COMERCIAL del aviso de caducidad (distinto de los de M2b, que no lo son).
// Art. 20.1 (remitente e identificación comercial) y 22.1 (revocación),
// RFC 8058 (baja de un clic) y las reglas de miedo-con-salida de
// `CLAUDE.md` (sin urgencia falsa, sin vida útil en años).
import { describe, expect, it } from 'vitest';
import {
  cabecerasBajaUnClic,
  claveIdempotencia,
  emailAvisoCaducidad,
  type DatosEmailAviso,
} from '@/lib/kit-caducidad/email-aviso-caducidad';

// R-M2a.2.7 / editorial.ts (kitemergenciacanarias): misma lista que
// tests/kit-caducidad/consentimiento.test.ts — urgencia falsa o respaldo oficial.
const TERMINOS_VETADOS = [
  'inminente',
  'cuenta atrás',
  'antes de que sea tarde',
  'solo hoy',
  'no esperes más',
  'en cualquier momento',
  'pánico',
  'recomendado por protección civil',
];

const REMITENTE = { nombre: 'Waterproof82 SL', nif: 'B12345678', direccion: 'Calle Falsa 123, Tenerife', email: 'titular@example.com' };

function datos(extra: Partial<DatosEmailAviso> = {}): DatosEmailAviso {
  return {
    serie: 'KEC-AAAA-BBBB-C',
    kitNombre: 'Kit Estándar 72H',
    kitSlug: 'kit-estandar-72h',
    elementos: [
      { ingredienteId: '1', consumible: 'Pastillas potabilizadoras', parte: '', caducaEl: '2031-03-01', diasRestantes: 30, estado: 'caduca_pronto' },
    ],
    remitente: REMITENTE,
    baseUrl: 'https://pedidos.kitemergenciacanarias.es',
    token: 'token-de-gestion',
    ...extra,
  };
}

describe('emailAvisoCaducidad', () => {
  it('empieza con "Comunicación comercial de {marca}" y nombra la serie', () => {
    const { html, texto } = emailAvisoCaducidad(datos());

    expect(html).toContain('Comunicación comercial de Waterproof82 SL');
    expect(html).toContain('KEC-AAAA-BBBB-C');
    expect(texto).toContain('Comunicación comercial de Waterproof82 SL');
    expect(texto).toContain('KEC-AAAA-BBBB-C');
  });

  it('asunto con un elemento', () => {
    const { asunto } = emailAvisoCaducidad(datos());

    expect(asunto).toBe('Tu Kit Estándar 72H: Pastillas potabilizadoras caduca el 1 de marzo de 2031');
  });

  it('asunto con varios elementos', () => {
    const dos = datos({
      elementos: [
        { ingredienteId: '1', consumible: 'A', parte: '', caducaEl: '2031-03-01', diasRestantes: 30, estado: 'caduca_pronto' },
        { ingredienteId: '2', consumible: 'B', parte: '', caducaEl: '2031-03-05', diasRestantes: 34, estado: 'caduca_pronto' },
      ],
    });

    expect(emailAvisoCaducidad(dos).asunto).toBe('Tu Kit Estándar 72H: 2 consumibles caducan pronto');
  });

  it('cada elemento nombra el consumible, la parte (si la hay), la fecha es-ES larga sobre UTC y los días que faltan', () => {
    const conParte = datos({
      elementos: [
        { ingredienteId: '2', consumible: 'Botiquín DIN 13164', parte: 'Antiséptico', caducaEl: '2031-02-14', diasRestantes: 15, estado: 'caduca_pronto' },
      ],
    });

    const { html, texto } = emailAvisoCaducidad(conParte);

    expect(html).toContain('Botiquín DIN 13164');
    expect(html).toContain('Antiséptico');
    expect(html).toContain('14 de febrero de 2031');
    expect(html).toContain('15');
    expect(texto).toContain('Botiquín DIN 13164');
    expect(texto).toContain('Antiséptico');
    expect(texto).toContain('14 de febrero de 2031');
  });

  it('enlaza al pack de recambio con ?kit=<slug>', () => {
    const { html } = emailAvisoCaducidad(datos());

    expect(html).toContain('https://kitemergenciacanarias.es/kits-de-emergencia/pack-recambio-consumibles?kit=kit-estandar-72h');
  });

  it('sin slug, enlaza al pack de recambio sin ?kit=', () => {
    const { html } = emailAvisoCaducidad(datos({ kitSlug: null }));

    expect(html).toContain('https://kitemergenciacanarias.es/kits-de-emergencia/pack-recambio-consumibles');
    expect(html).not.toContain('pack-recambio-consumibles?kit=');
  });

  it('el pie enlaza a /kit/avisos/<token>, dice "o escribe a" y nombra al titular, su NIF y dirección', () => {
    const { html, texto } = emailAvisoCaducidad(datos());

    expect(html).toContain('https://pedidos.kitemergenciacanarias.es/kit/avisos/token-de-gestion');
    expect(html).toContain('o escribe a');
    expect(html).toContain('Waterproof82 SL');
    expect(html).toContain('B12345678');
    expect(html).toContain('Calle Falsa 123, Tenerife');
    expect(texto).toContain('o escribe a');
    expect(texto).toContain('Waterproof82 SL');
  });

  it('devuelve HTML y texto plano', () => {
    const { html, texto } = emailAvisoCaducidad(datos());

    expect(html).toContain('<');
    expect(texto).not.toContain('<p>');
  });

  it('escapa <script> en el nombre del kit, del consumible y del titular', () => {
    const maligno = datos({
      kitNombre: '<script>alert(1)</script>',
      elementos: [
        { ingredienteId: '1', consumible: '<script>x</script>', parte: '', caducaEl: '2031-03-01', diasRestantes: 30, estado: 'caduca_pronto' },
      ],
      remitente: { ...REMITENTE, nombre: '<script>y</script>' },
    });

    const { html } = emailAvisoCaducidad(maligno);

    expect(html).not.toContain('<script>');
  });

  it('no contiene ningún término vetado ni una expresión de "X años"', () => {
    const { html, texto } = emailAvisoCaducidad(datos());
    const normalizado = (html + texto).toLowerCase();

    for (const termino of TERMINOS_VETADOS) {
      expect(normalizado).not.toContain(termino);
    }
    expect(normalizado).not.toMatch(/\d+\s*años/);
  });
});

describe('cabecerasBajaUnClic', () => {
  it('construye List-Unsubscribe y List-Unsubscribe-Post (RFC 8058)', () => {
    const cabeceras = cabecerasBajaUnClic('https://pedidos.kitemergenciacanarias.es/api/kit-avisos/baja/token', 'titular@example.com');

    expect(cabeceras).toEqual({
      'List-Unsubscribe': '<https://pedidos.kitemergenciacanarias.es/api/kit-avisos/baja/token>, <mailto:titular@example.com?subject=Baja%20avisos%20kit>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});

describe('claveIdempotencia', () => {
  it('es igual con las mismas claves en otro orden', () => {
    const a = claveIdempotencia(['x|1|30', 'y|2|15']);
    const b = claveIdempotencia(['y|2|15', 'x|1|30']);

    expect(a).toBe(b);
  });

  it('es distinta con otras claves', () => {
    expect(claveIdempotencia(['x|1|30'])).not.toBe(claveIdempotencia(['x|1|15']));
  });

  it('mide 64 caracteres hexadecimales', () => {
    expect(claveIdempotencia(['x|1|30'])).toMatch(/^[0-9a-f]{64}$/);
  });
});
