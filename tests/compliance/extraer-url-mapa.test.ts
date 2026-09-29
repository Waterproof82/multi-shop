import { describe, it, expect } from 'vitest';
import { extraerUrlMapa } from '@/lib/mapa/extraer-url-mapa';

// Google Maps → Compartir → "Insertar un mapa" da el <iframe> entero, no la
// URL. El input es type="url" y el DTO exige https://: pegar el iframe
// bloqueaba el guardado con "Introduce una URL" (2026-09-29).

const SRC =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4336.959323095328!2d-16.5182799!3d28.3955994!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xc402ab348c88507%3A0x37fa8c009dc4703c!2sBattery%20Center%2C%20La%20Casa%20de%20la%20Bater%C3%ADa!5e1!3m2!1ses!2ses!4v1790682545978!5m2!1ses!2ses';

describe('extraerUrlMapa', () => {
  it('saca el src del iframe que da Google Maps', () => {
    const iframe = `<iframe src="${SRC}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    expect(extraerUrlMapa(iframe)).toBe(SRC);
  });

  it('acepta comillas simples y espacios alrededor', () => {
    expect(extraerUrlMapa(`  <iframe width='600' src='${SRC}'></iframe>\n`)).toBe(SRC);
  });

  it('decodifica &amp; (iframes copiados desde HTML escapado)', () => {
    expect(extraerUrlMapa('<iframe src="https://maps.google.com/maps?q=a&amp;output=embed"></iframe>')).toBe(
      'https://maps.google.com/maps?q=a&output=embed'
    );
  });

  it('una URL suelta pasa tal cual (sin espacios)', () => {
    expect(extraerUrlMapa(` ${SRC} `)).toBe(SRC);
  });

  it('texto sin iframe se deja igual para que lo valide el formulario', () => {
    expect(extraerUrlMapa('hola')).toBe('hola');
    expect(extraerUrlMapa('')).toBe('');
  });
});
