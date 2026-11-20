// src/lib/pet-id/validacion.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// R-QR.9: las notas de salud del perfil (máx. 280 caracteres) y el mensaje
// del relay de contacto (máx. 1000 caracteres, R-QR.10.1) comparten esta
// misma validación pura — el `max` lo decide quien llama. R-QR.9.2 exige
// rechazar patrones reconocibles de email o de teléfono; una URL "pelada"
// (sin arroba ni una tanda de dígitos) no es, por sí sola, un dato
// personal y queda fuera de alcance, pero un enlace que SÍ lleva un email
// (`mailto:`) o un teléfono (`wa.me/<numero>`) cae en esos mismos
// patrones — por eso tasks.md la menciona sin que el diseño necesite un
// tercer código de resultado.

export type ResultadoValidacionTexto = 'ok' | 'contiene-email' | 'contiene-telefono' | 'largo';

const UMBRAL_DIGITOS_TELEFONO = 7;

// Email: suficiente para detectar el patrón, no para validar RFC 5322 —
// el objetivo es minimización de datos (R-QR.9.2), no aceptar un alta.
const PATRON_EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

// Una racha de dígitos con los separadores habituales de un teléfono
// (espacio, punto, guion, paréntesis) entre ellos; se cuenta solo los
// dígitos para decidir si llega al umbral.
const PATRON_TELEFONO = /(?:\d[\s().-]*){7,}/;

function contieneTelefono(texto: string): boolean {
  const coincidencia = texto.match(PATRON_TELEFONO);
  if (!coincidencia) return false;
  const digitos = coincidencia[0].replace(/\D/g, '');
  return digitos.length >= UMBRAL_DIGITOS_TELEFONO;
}

/**
 * @public — usada por `notas_salud` (R-QR.9) y por el mensaje del relay de
 * contacto (R-QR.10.1). El orden de las comprobaciones importa: un patrón
 * de contacto se rechaza aunque el texto también sea demasiado largo,
 * porque es el motivo más grave de rechazo.
 */
export function validarTextoPerfil(texto: string, max: number): ResultadoValidacionTexto {
  if (PATRON_EMAIL.test(texto)) return 'contiene-email';
  if (contieneTelefono(texto)) return 'contiene-telefono';
  if (texto.length > max) return 'largo';
  return 'ok';
}
