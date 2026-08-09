/**
 * Las DOS formas de escribir la referencia de un ticket, y por qué son dos.
 *
 * Parecen la misma cadena con un guion de diferencia. No lo son: tienen
 * destinatarios distintos, y uno de ellos es la Agencia Tributaria.
 *
 *   refTicketVisible('T', 123)  ->  'T-000123'   para una persona
 *   numserieAeat('T', 123)      ->  'T000123'    para la AEAT
 *
 * NO LAS UNIFIQUES. Es la razón por la que este módulo existe con dos funciones
 * en lugar de una: al verlas escritas a mano en cuatro sitios, la conclusión
 * natural era que una de las dos estaba mal.
 */

/** Ambas comparten el relleno a 6 dígitos; lo único que cambia es el separador. */
function numeroConCeros(numeroTicket: number): string {
  return String(numeroTicket).padStart(6, '0');
}

/**
 * Referencia LEGIBLE del ticket: `T-000123`.
 *
 * Es la que ve el cajero en pantalla y la que aparece en el histórico. Solo
 * tiene que ser fácil de leer y de dictar por teléfono.
 */
export function refTicketVisible(serie: string, numeroTicket: number): string {
  return `${serie}-${numeroConCeros(numeroTicket)}`;
}

/**
 * Parámetro `numserie` del QR de verificación de la AEAT: `T000123`, SIN guion.
 *
 * Alimenta la URL de validación de VeriFactu (RD 1007/2023):
 *
 *   https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?...&numserie=T000123
 *
 * EL FORMATO LO DICTA HACIENDA, no nosotros. Añadirle un guion "por coherencia"
 * rompe la verificación fiscal de una forma que NO da ningún error visible: el
 * ticket se imprime igual, el QR se escanea igual, y la AEAT responde que esa
 * factura no consta. El fallo aparece en una inspección, no en un log.
 *
 * Si algún día cambia, cambia porque lo cambió el BOE — no porque quedara feo.
 */
export function numserieAeat(serie: string, numeroTicket: number): string {
  return `${serie}${numeroConCeros(numeroTicket)}`;
}
