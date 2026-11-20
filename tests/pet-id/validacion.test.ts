import { describe, expect, it } from 'vitest';
import { validarTextoPerfil } from '@/lib/pet-id/validacion';

// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// R-QR.9: las notas de salud (max=280) y el mensaje del relay (max=1000)
// comparten la misma validación pura. R-QR.9.2 solo exige rechazar
// patrones de email o de teléfono; una URL "pelada" (sin arroba ni
// secuencia de dígitos) no es un dato personal por sí sola y no se
// rechaza — pero una URL que SÍ contiene un email (`mailto:`) o un
// teléfono (`wa.me/<numero>`) cae en esos mismos patrones (ver el
// describe de abajo), que es lo que pide tasks.md al mencionar "URL".
const MAX_NOTAS = 280;
const MAX_MENSAJE_RELAY = 1000;

describe('validarTextoPerfil', () => {
  it('acepta un texto normal dentro del límite', () => {
    expect(validarTextoPerfil('Le gusta correr por la playa y tiene alergia al polen.', MAX_NOTAS)).toBe('ok');
  });

  it('acepta un texto que mide exactamente el máximo', () => {
    expect(validarTextoPerfil('a'.repeat(MAX_NOTAS), MAX_NOTAS)).toBe('ok');
  });

  it('rechaza un texto que supera el máximo en un carácter', () => {
    expect(validarTextoPerfil('a'.repeat(MAX_NOTAS + 1), MAX_NOTAS)).toBe('largo');
  });

  it('rechaza el mensaje del relay si supera los 1000 caracteres (R-QR.10.1)', () => {
    expect(validarTextoPerfil('a'.repeat(MAX_MENSAJE_RELAY + 1), MAX_MENSAJE_RELAY)).toBe('largo');
  });

  it('rechaza un texto con un email (R-QR.9.2)', () => {
    expect(validarTextoPerfil('Escríbeme a maria@ejemplo.com si la encuentras', MAX_NOTAS)).toBe('contiene-email');
  });

  it('rechaza un email con mayúsculas y subdominio', () => {
    expect(validarTextoPerfil('Contacto: Maria.Perez@correo.ejemplo.es', MAX_NOTAS)).toBe('contiene-email');
  });

  it('rechaza un texto con 7 dígitos consecutivos (R-QR.9.2)', () => {
    expect(validarTextoPerfil('Llamar al 6123456 si aparece', MAX_NOTAS)).toBe('contiene-telefono');
  });

  it('rechaza un teléfono con separadores habituales', () => {
    expect(validarTextoPerfil('Mi número es 612 345 678', MAX_NOTAS)).toBe('contiene-telefono');
  });

  it('no rechaza 6 dígitos sueltos (no llegan al umbral de teléfono)', () => {
    expect(validarTextoPerfil('Nació en el año 123456', MAX_NOTAS)).toBe('ok');
  });

  it('rechaza un enlace mailto (URL que contiene un email)', () => {
    expect(validarTextoPerfil('Escríbeme a mailto:maria@ejemplo.com', MAX_NOTAS)).toBe('contiene-email');
  });

  it('rechaza un enlace de WhatsApp con el número (URL que contiene un teléfono)', () => {
    expect(validarTextoPerfil('https://wa.me/34612345678', MAX_NOTAS)).toBe('contiene-telefono');
  });

  it('no rechaza una URL sin email ni teléfono (fuera de alcance de R-QR.9.2)', () => {
    expect(validarTextoPerfil('Más fotos en mi-perfil-de-mascota.example', MAX_NOTAS)).toBe('ok');
  });

  it('el email tiene prioridad si el texto también es demasiado largo', () => {
    const textoLargoConEmail = `${'a'.repeat(MAX_NOTAS)} maria@ejemplo.com`;
    expect(validarTextoPerfil(textoLargoConEmail, MAX_NOTAS)).toBe('contiene-email');
  });
});
