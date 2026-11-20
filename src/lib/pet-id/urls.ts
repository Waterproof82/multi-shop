// src/lib/pet-id/urls.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// R-QR.2.2/DD3: la URL pública del perfil debe ser lo más corta posible,
// para minimizar la versión del QR impreso en la chapa. Con el dominio
// `pedidos.kitemergenciacanarias.es` y la ruta `/m/{codigo}`, la URL
// completa (56 bytes) cabe en la versión 4 de QR con nivel de corrección M
// (33 módulos + 8 de zona de silencio).
//
// R2 de tasks.md: el dominio es resolución multi-tenant ya existente
// (igual que `URL_TIENDA_KEC` de `kit-caducidad/etiqueta-urls.ts`), no una
// decisión nueva — mientras el módulo solo lo tenga activo KEC.
import { esCodigoChapaValido } from './codigo';

export const URL_TIENDA_MASCOTAS = 'https://pedidos.kitemergenciacanarias.es';

/**
 * URL del perfil público de la chapa. `codigo` debe llegar ya en forma
 * canónica (la que guarda `pet_chapas.codigo`) — esta función NO normaliza,
 * solo valida con `esCodigoChapaValido`.
 */
export function urlPerfilChapa(codigo: string): string | null {
  if (!esCodigoChapaValido(codigo)) return null;
  return `${URL_TIENDA_MASCOTAS}/m/${codigo}`;
}
