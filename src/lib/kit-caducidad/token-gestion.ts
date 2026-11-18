// src/lib/kit-caducidad/token-gestion.ts
// kit-expiry-m2b, DD3 de design.md: token aleatorio (256 bits) en base64url
// para `kits_registrados.baja_token`. NO caduca (dura lo que dura el kit),
// se regenera en cada alta y el mismo token sirve para confirmar (R-M2b.3.3)
// y para la baja (R-M2b.3.4). No usa el HMAC con TTL de
// `unsubscribe-token.ts` — ese expira en un año, y un kit dura más.
import { randomBytes } from 'node:crypto';

/** 256 bits en base64url, sin relleno: 43 caracteres exactos. */
const PATRON_TOKEN_GESTION = /^[A-Za-z0-9_-]{43}$/;

/** @public — usado por el repositorio (M2b3) al reservar un alta. */
export function generarTokenGestion(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Comprueba la FORMA del token antes de consultar la base de datos — nunca
 * sustituye la consulta por `baja_token`, solo evita una query con un valor
 * que no puede ser un token válido (ej. llega vacío o con `+`/`/`/`=`).
 */
export function esTokenGestion(token: string): boolean {
  return PATRON_TOKEN_GESTION.test(token);
}
