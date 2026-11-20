// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// DD10/R-QR.11: las casillas del perfil de la mascota, igual que las de
// `kit-caducidad/consentimiento.ts` (R-M2b.1.3/1.4): si una sola palabra de
// cualquier idioma cambia SIN subir la versión, el hash deja de coincidir
// y este test se pone en rojo — es la señal de que hay que avisar a los
// dueños que ya consintieron la versión anterior.
//
// Textos en BORRADOR, pendientes de revisión legal del propietario (flag 8
// de tasks.md). Versiones en v1.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TEXTOS_CONSENTIMIENTO_PERFIL,
  TEXTO_CONSENTIMIENTO_PERFIL_VERSION,
  TEXTOS_CONSENTIMIENTO_TELEFONO,
  TEXTO_CONSENTIMIENTO_TELEFONO_VERSION,
  TEXTOS_CONSENTIMIENTO_RELAY,
  TEXTO_CONSENTIMIENTO_RELAY_VERSION,
} from '@/lib/pet-id/consentimiento';

const IDIOMAS = ['es', 'en', 'fr', 'it', 'de'] as const;

// Calculados una vez con los textos actuales de este commit (sha256 de los
// valores unidos por '\n', en el orden es→en→fr→it→de).
const HASH_PERFIL_V1 = '2668abec3e5e50f73257ef83d94d13e75a6e0da167c5e71ec8c51f10b5fe904d';
const HASH_TELEFONO_V1 = 'f5e3e884af601343fc998e8d591e964740a6beef864d8ef23e93b4360cea2fa0';
const HASH_RELAY_V1 = '74be65393e1b04e2299dd4b70b7a8aca7f9204be2acc7496a3290fea94d356a3';

function hashDe(valores: readonly string[]): string {
  return createHash('sha256').update(valores.join('\n')).digest('hex');
}

describe('TEXTOS_CONSENTIMIENTO_PERFIL (R-QR.4.1/R-QR.5.2)', () => {
  it('tiene los 5 idiomas soportados', () => {
    for (const idioma of IDIOMAS) {
      expect(TEXTOS_CONSENTIMIENTO_PERFIL[idioma]).toBeDefined();
    }
  });

  it('cada idioma tiene exactamente 2 textos: privacidad y publicación', () => {
    for (const idioma of IDIOMAS) {
      expect(TEXTOS_CONSENTIMIENTO_PERFIL[idioma]).toHaveLength(2);
    }
  });

  it('el texto de privacidad en español menciona la política de privacidad', () => {
    const [privacidad] = TEXTOS_CONSENTIMIENTO_PERFIL.es;
    expect(privacidad.toLowerCase()).toContain('política de privacidad');
  });

  it('el texto de publicación en español dice qué se publica y para qué', () => {
    const [, publicacion] = TEXTOS_CONSENTIMIENTO_PERFIL.es;
    expect(publicacion.toLowerCase()).toContain('perfil');
    expect(publicacion.toLowerCase()).toContain('contactarme');
  });

  it('el hash de los 10 textos (5 idiomas × 2) coincide con la versión actual', () => {
    const valores = IDIOMAS.flatMap((idioma) => TEXTOS_CONSENTIMIENTO_PERFIL[idioma]);
    expect(hashDe(valores)).toBe(HASH_PERFIL_V1);
  });

  it('la versión mide 32 caracteres o menos', () => {
    expect(TEXTO_CONSENTIMIENTO_PERFIL_VERSION.length).toBeLessThanOrEqual(32);
  });

  it('la versión es "pet-perfil-v1"', () => {
    expect(TEXTO_CONSENTIMIENTO_PERFIL_VERSION).toBe('pet-perfil-v1');
  });
});

describe('TEXTOS_CONSENTIMIENTO_TELEFONO (D-PET-7/R-QR.7.1)', () => {
  it('tiene los 5 idiomas soportados', () => {
    for (const idioma of IDIOMAS) {
      expect(typeof TEXTOS_CONSENTIMIENTO_TELEFONO[idioma]).toBe('string');
    }
  });

  it('el texto en español es, literalmente, el fijado por el propietario', () => {
    expect(TEXTOS_CONSENTIMIENTO_TELEFONO.es).toContain(
      'Autorizo que se muestre mi teléfono a quien encuentre a mi mascota',
    );
  });

  it('el texto en español deja claro que aparecerá un botón de llamada', () => {
    expect(TEXTOS_CONSENTIMIENTO_TELEFONO.es.toLowerCase()).toContain('botón');
    expect(TEXTOS_CONSENTIMIENTO_TELEFONO.es.toLowerCase()).toContain('llamar');
  });

  it('el texto en español deja claro que se puede retirar desde la gestión', () => {
    const texto = TEXTOS_CONSENTIMIENTO_TELEFONO.es.toLowerCase();
    expect(texto).toMatch(/retirar|revocar/);
    expect(texto).toContain('gestión');
  });

  it('cada idioma traduce con fidelidad: menciona teléfono/número y gestión/link', () => {
    const PISTAS: Record<(typeof IDIOMAS)[number], [RegExp, RegExp]> = {
      es: [/teléfono|número/i, /gestión/i],
      en: [/phone|number/i, /management/i],
      fr: [/téléphone|numéro/i, /gestion/i],
      it: [/telefono|numero/i, /gestione/i],
      de: [/telefonnummer|nummer/i, /verwaltung/i],
    };
    for (const idioma of IDIOMAS) {
      const [pistaTelefono, pistaGestion] = PISTAS[idioma];
      expect(TEXTOS_CONSENTIMIENTO_TELEFONO[idioma]).toMatch(pistaTelefono);
      expect(TEXTOS_CONSENTIMIENTO_TELEFONO[idioma]).toMatch(pistaGestion);
    }
  });

  it('el hash de los 5 textos coincide con la versión actual', () => {
    const valores = IDIOMAS.map((idioma) => TEXTOS_CONSENTIMIENTO_TELEFONO[idioma]);
    expect(hashDe(valores)).toBe(HASH_TELEFONO_V1);
  });

  it('la versión es "pet-tel-v1"', () => {
    expect(TEXTO_CONSENTIMIENTO_TELEFONO_VERSION).toBe('pet-tel-v1');
  });
});

describe('TEXTOS_CONSENTIMIENTO_RELAY (R-QR.10.1, DD18: no se guarda)', () => {
  it('tiene los 5 idiomas soportados', () => {
    for (const idioma of IDIOMAS) {
      expect(typeof TEXTOS_CONSENTIMIENTO_RELAY[idioma]).toBe('string');
    }
  });

  it('el texto en español menciona la política de privacidad', () => {
    expect(TEXTOS_CONSENTIMIENTO_RELAY.es.toLowerCase()).toContain('política de privacidad');
  });

  it('el hash de los 5 textos coincide con la versión actual', () => {
    const valores = IDIOMAS.map((idioma) => TEXTOS_CONSENTIMIENTO_RELAY[idioma]);
    expect(hashDe(valores)).toBe(HASH_RELAY_V1);
  });

  it('la versión es "pet-relay-v1"', () => {
    expect(TEXTO_CONSENTIMIENTO_RELAY_VERSION).toBe('pet-relay-v1');
  });
});

describe('ninguna casilla menciona un enlace de compra (son avisos no comerciales)', () => {
  it('privacidad del perfil, teléfono y relay no contienen "comprar" ni "/producto"', () => {
    const todos = [
      ...IDIOMAS.flatMap((idioma) => TEXTOS_CONSENTIMIENTO_PERFIL[idioma]),
      ...IDIOMAS.map((idioma) => TEXTOS_CONSENTIMIENTO_TELEFONO[idioma]),
      ...IDIOMAS.map((idioma) => TEXTOS_CONSENTIMIENTO_RELAY[idioma]),
    ];
    for (const texto of todos) {
      expect(texto.toLowerCase()).not.toContain('comprar');
      expect(texto.toLowerCase()).not.toContain('/producto');
    }
  });
});
