import { describe, expect, it } from 'vitest';
import { idiomaDePeticion } from '@/lib/pet-id/idioma';

// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// DD9/R-QR.6.4: el idioma de quien escanea se resuelve en el SERVIDOR, no
// en el cliente, para que el HTML del SSR ya venga en el idioma correcto
// (sin el parpadeo de `useLanguage()`). "Sin fallback incorrecto" (DD9)
// significa: NO basta con mirar solo la primera entrada de
// `accept-language` (como hace el parseo ingenuo de
// `api/descuento/subscribe/route.ts`) — hay que recorrer toda la lista
// ordenada por `q` y quedarse con la primera que SÍ esté entre los 5
// idiomas soportados.
describe('idiomaDePeticion', () => {
  it('usa `lang` si es uno de los 5 idiomas soportados', () => {
    expect(idiomaDePeticion('fr', 'es')).toBe('fr');
  });

  it('`lang` no distingue mayúsculas', () => {
    expect(idiomaDePeticion('DE', undefined)).toBe('de');
  });

  it('ignora un `lang` no soportado y sigue con accept-language', () => {
    expect(idiomaDePeticion('ca', 'it')).toBe('it');
  });

  it('sin `lang`, usa la primera entrada de accept-language si está soportada', () => {
    expect(idiomaDePeticion(undefined, 'en-GB,es;q=0.8')).toBe('en');
  });

  it('salta la primera entrada si no está soportada y usa la siguiente (sin fallback incorrecto)', () => {
    expect(idiomaDePeticion(undefined, 'ca,es;q=0.9,en;q=0.8')).toBe('es');
  });

  it('respeta el orden de calidad `q` aunque no sea el orden de aparición', () => {
    expect(idiomaDePeticion(undefined, 'es;q=0.5,fr;q=0.9')).toBe('fr');
  });

  it('ninguna entrada soportada: por defecto `es`', () => {
    expect(idiomaDePeticion(undefined, 'ca,eu,gl')).toBe('es');
  });

  it('sin `lang` ni accept-language: por defecto `es`', () => {
    expect(idiomaDePeticion(undefined, undefined)).toBe('es');
  });

  it('una cabecera vacía o solo espacios no rompe la resolución', () => {
    expect(idiomaDePeticion(undefined, '   ')).toBe('es');
  });

  it('una cabecera con segmentos mal formados no lanza y sigue con el resto', () => {
    expect(idiomaDePeticion(undefined, ';q=,,it;q=0.7')).toBe('it');
  });

  it('un `lang` vacío se trata como ausente', () => {
    expect(idiomaDePeticion('', 'de')).toBe('de');
  });
});
