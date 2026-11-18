// src/lib/kit-caducidad/etiqueta-urls.ts
// kit-expiry-m5 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m5/)
// R-M5.2.2/DD9: URL fijas de KEC — constantes, no parametrizadas, porque la
// sección de etiquetas solo existe con `kits_caducidad_habilitado`, que hoy
// solo tiene KEC. Si otro tenant lo activa, se revisará (pregunta abierta
// de design.md).
import { esSerieValida } from './serie';

export const URL_LISTA_MOCHILA = 'https://kitemergenciacanarias.es/lista-mochila-emergencia';

/**
 * URL del QR 1 («Estado y avisos»). `serie` debe llegar ya en forma
 * canónica (la que guarda `kits_registrados.serie`) — esta función NO
 * normaliza, solo valida con `esSerieValida`.
 */
export function urlEstadoKit(serie: string): string | null {
  if (!esSerieValida(serie)) return null;
  return `https://pedidos.kitemergenciacanarias.es/kit/${serie}`;
}

// sdd kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), R-M2a.2.5.
export const URL_PACK_RECAMBIO = 'https://kitemergenciacanarias.es/kits-de-emergencia/pack-recambio-consumibles';

const SLUG_VALIDO = /^[a-z0-9-]{1,100}$/;

/**
 * URL del pack de recambio de consumibles. Con un `slug` de producto
 * válido (`^[a-z0-9-]{1,100}$`), preselecciona el kit con `?kit=`; sin uno
 * (null, vacío, fuera del patrón o más de 100 caracteres) va sin el
 * parámetro — D-M2a-7: el enlace no se rompe, solo pierde el
 * preseleccionado.
 */
export function urlPackRecambio(slug: string | null): string {
  if (slug === null || !SLUG_VALIDO.test(slug)) return URL_PACK_RECAMBIO;
  return `${URL_PACK_RECAMBIO}?kit=${slug}`;
}
