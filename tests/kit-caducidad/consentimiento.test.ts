// sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), R-M2b.1.3/R-M2b.1.4:
// los tres textos de las casillas del alta de avisos y su versión. Si
// cambia una palabra de cualquier texto SIN subir la versión, el hash deja
// de coincidir con HASH_V1 y este test se pone en rojo — es la única forma
// de notar que hace falta avisar a los usuarios ya suscritos de un cambio
// de condiciones (D-M2b-1).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TEXTOS_CONSENTIMIENTO, TEXTO_CONSENTIMIENTO_VERSION } from '@/lib/kit-caducidad/consentimiento';

// Calculado una vez con los textos actuales (sha256 de TEXTOS_CONSENTIMIENTO.join('\n')).
const HASH_V1 = 'b180a5d3103e19a9681496c947fb99a688f123d68dee9d751f01a8f1a1e00add';

// R-M2a.2.7 / editorial.ts (kitemergenciacanarias): urgencia falsa o respaldo oficial.
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

describe('TEXTOS_CONSENTIMIENTO', () => {
  it('tiene exactamente tres textos', () => {
    expect(TEXTOS_CONSENTIMIENTO).toHaveLength(3);
  });

  it('el texto de email contiene el enlace para comprar el recambio y los plazos de 30 y 15 días', () => {
    const [, email] = TEXTOS_CONSENTIMIENTO;
    expect(email).toContain('enlace para comprar el recambio');
    expect(email).toContain('30 y 15 días');
  });

  it('el texto de WhatsApp dice que el servicio aún no está disponible', () => {
    const [, , whatsapp] = TEXTOS_CONSENTIMIENTO;
    expect(whatsapp).toContain('cuando el servicio esté disponible');
  });

  it('ningún texto contiene un término vetado de urgencia falsa o respaldo oficial', () => {
    for (const texto of TEXTOS_CONSENTIMIENTO) {
      const normalizado = texto.toLowerCase();
      for (const termino of TERMINOS_VETADOS) {
        expect(normalizado).not.toContain(termino);
      }
    }
  });
});

describe('TEXTO_CONSENTIMIENTO_VERSION', () => {
  it('mide 32 caracteres o menos', () => {
    expect(TEXTO_CONSENTIMIENTO_VERSION.length).toBeLessThanOrEqual(32);
  });

  it('es "kit-avisos-v1"', () => {
    expect(TEXTO_CONSENTIMIENTO_VERSION).toBe('kit-avisos-v1');
  });

  it('el hash de los textos unidos coincide con la versión actual (si cambia un texto sin cambiar la versión, este test se pone en rojo)', () => {
    const hash = createHash('sha256').update(TEXTOS_CONSENTIMIENTO.join('\n')).digest('hex');
    expect(hash).toBe(HASH_V1);
  });
});
