/**
 * Idempotencia de creación de pedidos.
 *
 * `POST /api/pedidos` crea una comanda por llamada. Con red degradada —el caso
 * real del comedor: WiFi asociado sin salida, 4G a una raya— `fetch()` no falla
 * rápido, se queda colgado; el comensal vuelve a pulsar y la cocina recibe el
 * pedido dos veces. La clave de idempotencia hace que el segundo envío devuelva
 * el pedido original en vez de crear otro.
 *
 * El cliente elige la clave y la manda en la cabecera `Idempotency-Key`. Nunca
 * viaja en el cuerpo: el cuerpo lo valida Zod y añadirla ahí la convertiría en
 * un campo más del pedido, cuando en realidad es metadato de transporte.
 */

/** Cabecera estándar (draft IETF `idempotency-key-header`). */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * Formato aceptado. Alfanumérico más `_`, `-` y `:`, entre 16 y 128 caracteres.
 *
 * El `:` está permitido a propósito: un envío de mesa con varios pases genera
 * una comanda por pase, todas del mismo intento del usuario, y se distinguen
 * namespaciando la clave base (`<uuid>:primer`). Ver `buildIdempotencyKey`.
 *
 * El mínimo de 16 no es cosmético. La clave es lo que el servidor usa para
 * decidir "esto ya lo hiciste": una clave corta o predecible la puede repetir
 * un tercero. Los clientes de este repo generan un UUID v4. La huella del
 * payload (`fingerprintPayload`) es la red de seguridad para quien no lo haga.
 */
const KEY_PATTERN = /^[A-Za-z0-9_:-]{16,128}$/;

export function isValidIdempotencyKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

/**
 * Deriva la clave de una sub-petición a partir de la clave base del intento.
 *
 * `sufijo` identifica de forma estable qué trozo del envío es. Estable es la
 * palabra importante: si el sufijo cambiara entre reintentos, cada intento
 * estrenaría clave y la idempotencia no serviría de nada.
 */
export function buildIdempotencyKey(base: string, sufijo: string | null | undefined): string {
  return sufijo ? `${base}:${sufijo}` : base;
}

/**
 * Serialización estable: mismo contenido → misma cadena, sin depender del orden
 * en que el cliente haya escrito las claves del JSON.
 *
 * `JSON.stringify` a secas no vale porque conserva el orden de inserción, y dos
 * reintentos del mismo pedido pueden serializar las propiedades en distinto
 * orden (basta que una rama del cliente construya el objeto de otra manera).
 * Eso daría huellas distintas para un pedido idéntico → 409 espurio.
 *
 * El orden de los ARRAYS sí se respeta: en `items` el orden es contenido, no
 * presentación. `undefined` se descarta para que una propiedad ausente y una
 * presente con valor `undefined` produzcan la misma huella.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * Huella SHA-256 del contenido del pedido.
 *
 * POR QUÉ EXISTE
 * Al reproducir una clave ya usada el servidor devuelve la respuesta original,
 * y esa respuesta incluye el `tracking_token` — una credencial al portador con
 * la que se consulta el pedido. Si acertar la clave bastara, adivinarla sería
 * una forma de cosechar tokens ajenos. Exigir que la huella coincida cierra esa
 * vía: quien no conoce el pedido exacto no puede reproducirlo.
 *
 * Se usa Web Crypto (no `node:crypto`) para no atar este módulo al runtime de
 * Node: la misma función sirve en edge y en los tests.
 */
export async function fingerprintPayload(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lee y valida la cabecera. Devuelve `null` si falta o no cumple el formato. */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get(IDEMPOTENCY_HEADER);
  return isValidIdempotencyKey(raw) ? raw : null;
}
