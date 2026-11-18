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
