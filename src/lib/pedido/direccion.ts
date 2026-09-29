/** Largo máximo de "piso, puerta, escalera". `direccion_entrega` admite 500. */
export const DIRECCION_DETALLE_MAX = 100;

/**
 * Dirección de Mapbox + piso/puerta escrito por el cliente.
 *
 * Mapbox geocodifica portales, no viviendas, así que el detalle se escribe
 * aparte y se incrusta tras calle y número ("…57, Puerta 501, 38356 …"), donde
 * lo lee quien reparte. Va en el mismo texto que `direccion_entrega` para que
 * llegue a Glovo, emails, admin y seguimiento sin tocar cada uno.
 */
export function direccionCompleta(direccion: string, detalle: string): string {
  const extra = detalle.trim();
  if (!direccion || !extra) return direccion;
  const coma = direccion.indexOf(', ');
  if (coma === -1) return `${direccion}, ${extra}`;
  return `${direccion.slice(0, coma)}, ${extra}${direccion.slice(coma)}`;
}
