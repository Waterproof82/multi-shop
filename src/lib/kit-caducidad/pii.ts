// src/lib/kit-caducidad/pii.ts
// kit-expiry-reminders M4d (sdd en kitemergenciacanarias,
// docs/sdd/kit-expiry-reminders/m4/), R-M4.5.2/R-M4.5.3, DD12 de design.md:
// funciones puras usadas por el mapper del repositorio (`findRegistrados`)
// para que el email/telefono completos nunca salgan del repositorio en el
// listado. Solo `findContacto` (reveal explícito) devuelve el valor entero.

const RELLENO = '*';
const DIGITOS_VISIBLES_TELEFONO = 2;

function enmascararLocal(local: string): string {
  if (local.length <= 1) return RELLENO;
  if (local.length === 2) return `${local[0]}${RELLENO}`;
  return `${local[0]}${RELLENO.repeat(3)}${local[local.length - 1]}`;
}

/** Oculta el usuario del email entre el primer y el último carácter; el dominio queda visible. */
export function enmascararEmail(email: string | null): string | null {
  if (!email) return null;
  const arroba = email.indexOf('@');
  if (arroba <= 0) return RELLENO.repeat(3);
  const local = email.slice(0, arroba);
  const dominio = email.slice(arroba); // incluye '@'
  return `${enmascararLocal(local)}${dominio}`;
}

/** Oculta todo el teléfono salvo los últimos 2 dígitos. */
export function enmascararTelefono(telefono: string | null): string | null {
  if (!telefono) return null;
  if (telefono.length <= DIGITOS_VISIBLES_TELEFONO) return RELLENO.repeat(telefono.length);
  const visibles = telefono.slice(-DIGITOS_VISIBLES_TELEFONO);
  return `${RELLENO.repeat(telefono.length - DIGITOS_VISIBLES_TELEFONO)}${visibles}`;
}
