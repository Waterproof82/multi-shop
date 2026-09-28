/**
 * `t()` cae en silencio al español cuando una clave falta en el idioma pedido,
 * y el tipado no lo impide: `fr`/`it`/`de` no están obligados a tener las
 * mismas claves que `es`. Paso de verdad (2026-09-28): fr/it/de tenían 539 de
 * 1082 claves — un visitante en francés veía la carta y el admin a medias en
 * español, sin que nada fallara.
 *
 * Como `t()` solo acepta claves de `es` (keyof), exigir que cada idioma tenga
 * TODAS las claves de `es` basta para que ninguna pantalla caiga al español.
 */
import { describe, it, expect } from 'vitest';
import { translations } from '../../src/lib/translations';

const IDIOMAS = ['en', 'fr', 'it', 'de'] as const;
const clavesEs = Object.keys(translations.es);

describe('paridad de traducciones con es', () => {
  it('es tiene claves (el diccionario se importa bien)', () => {
    expect(clavesEs.length).toBeGreaterThan(1000);
  });

  for (const idioma of IDIOMAS) {
    const dic = translations[idioma] as Record<string, string>;

    it(`"${idioma}" tiene todas las claves de es`, () => {
      expect(clavesEs.filter(k => !(k in dic))).toEqual([]);
    });

    it(`"${idioma}" no tiene claves que es no conoce (t() nunca las pediría)`, () => {
      expect(Object.keys(dic).filter(k => !(k in translations.es))).toEqual([]);
    });

    it(`"${idioma}" no tiene textos vacíos`, () => {
      expect(Object.entries(dic).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
    });
  }
});
