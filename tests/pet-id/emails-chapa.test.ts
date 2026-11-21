// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 10 (DD17/R-QR.4): dos emails NO comerciales — confirmación del alta
// e "intento" (chapa ya activa) — en los 5 idiomas soportados (R-QR.6.4).
// Reutilizan `remitenteDe`/`Remitente` de `kit-caducidad/emails-avisos.ts`
// (Enfoque técnico de design.md: "los puertos se reutilizan tal cual").
// Calco de `tests/kit-caducidad/emails-avisos.test.ts`, ampliado a 5 idiomas.
import { describe, expect, it } from 'vitest';
import { emailConfirmacionChapa, emailIntentoAlta } from '@/lib/pet-id/emails-chapa';
import type { Language } from '@/lib/language-context';

const REMITENTE_COMPLETO = {
  nombre: 'Kit Emergencia Canarias SL',
  nif: 'B12345678',
  direccion: 'Calle Falsa 1, Santa Cruz',
  email: 'contacto@kitemergenciacanarias.es',
};

const IDIOMAS: Language[] = ['es', 'en', 'fr', 'it', 'de'];
const PROHIBIDOS = ['producto', 'comprar', 'pack-'];

function datos(overrides: Record<string, unknown> = {}) {
  return {
    nombre: 'Luna',
    codigo: 'M-ABCD-1234-5',
    token: 'a'.repeat(43),
    baseUrl: 'https://tienda.kitemergenciacanarias.es',
    remitente: REMITENTE_COMPLETO,
    idioma: 'es' as Language,
    ...overrides,
  };
}

describe('emailConfirmacionChapa', () => {
  it.each(IDIOMAS)('en %s: lleva el nombre de la mascota, el enlace de gestión y "caduca"/"48"', (idioma) => {
    const { html, texto } = emailConfirmacionChapa(datos({ idioma }));
    for (const parte of [html, texto]) {
      expect(parte).toContain('Luna');
      expect(parte).toContain(`https://tienda.kitemergenciacanarias.es/m/gestion/${'a'.repeat(43)}`);
      expect(parte).toMatch(/48/);
    }
  });

  it.each(IDIOMAS)('en %s: lleva el titular, el NIF y "o escribe a" (equivalente localizado)', (idioma) => {
    const { html, texto } = emailConfirmacionChapa(datos({ idioma }));
    for (const parte of [html, texto]) {
      expect(parte).toContain('Kit Emergencia Canarias SL');
      expect(parte).toContain('B12345678');
      expect(parte).toContain('contacto@kitemergenciacanarias.es');
    }
  });

  it.each(IDIOMAS)('en %s: no contiene producto, comprar ni pack- (no es un email comercial)', (idioma) => {
    const { html, texto } = emailConfirmacionChapa(datos({ idioma }));
    for (const parte of [html, texto]) {
      for (const prohibido of PROHIBIDOS) {
        expect(parte.toLowerCase()).not.toContain(prohibido);
      }
    }
  });

  it('un nombre de mascota con <script> sale escapado en el html', () => {
    const { html } = emailConfirmacionChapa(datos({ nombre: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('un titular con <script> sale escapado en el html', () => {
    const { html } = emailConfirmacionChapa(
      datos({ remitente: { ...REMITENTE_COMPLETO, nombre: '<script>alert(1)</script>' } }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('emailIntentoAlta', () => {
  it.each(IDIOMAS)('en %s: dice que alguien ha intentado activar la chapa y que no se ha cambiado nada', (idioma) => {
    const { html, texto } = emailIntentoAlta(datos({ idioma }));
    for (const parte of [html, texto]) {
      expect(parte).toContain('Luna');
    }
  });

  it.each(IDIOMAS)('en %s: lleva el enlace de gestión y el titular', (idioma) => {
    const { html, texto } = emailIntentoAlta(datos({ idioma }));
    for (const parte of [html, texto]) {
      expect(parte).toContain(`https://tienda.kitemergenciacanarias.es/m/gestion/${'a'.repeat(43)}`);
      expect(parte).toContain('Kit Emergencia Canarias SL');
    }
  });

  it.each(IDIOMAS)('en %s: no contiene producto, comprar ni pack-', (idioma) => {
    const { html, texto } = emailIntentoAlta(datos({ idioma }));
    for (const parte of [html, texto]) {
      for (const prohibido of PROHIBIDOS) {
        expect(parte.toLowerCase()).not.toContain(prohibido);
      }
    }
  });

  it('un nombre de mascota con <script> sale escapado en el html', () => {
    const { html } = emailIntentoAlta(datos({ nombre: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
