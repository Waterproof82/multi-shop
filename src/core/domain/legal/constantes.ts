/**
 * Suelos legales de las páginas de venta (TRLGDCU, RDL 1/2007 tras RDL 7/2021).
 * Todo valor configurable por el tenant se valida contra estos mínimos: un
 * tenant puede AMPLIAR derechos del consumidor, nunca recortarlos.
 */
export const MIN_DESISTIMIENTO_DIAS = 14; // art. 104
export const MAX_DESISTIMIENTO_DIAS = 365;
export const GARANTIA_NUEVO_MESES = 36; // art. 120 — bienes nuevos
export const MIN_SEGUNDA_MANO_MESES = 12; // art. 120.1 — pactable, nunca < 1 año
export const PLAZO_REEMBOLSO_DIAS = 14; // art. 107

/** Supuestos de exclusión del derecho de desistimiento aplicables a bienes (art. 103 TRLGDCU). */
export const SUPUESTOS_ART_103 = [
  { codigo: 'precio_mercado_financiero', letra: 'b', etiqueta: 'Bienes cuyo precio dependa de fluctuaciones del mercado financiero' },
  { codigo: 'personalizados', letra: 'c', etiqueta: 'Bienes confeccionados según las especificaciones del consumidor o claramente personalizados' },
  { codigo: 'perecederos', letra: 'd', etiqueta: 'Bienes que puedan deteriorarse o caducar con rapidez' },
  { codigo: 'precintados_higiene', letra: 'e', etiqueta: 'Bienes precintados no aptos para devolución por razones de salud o higiene que hayan sido desprecintados' },
  { codigo: 'mezclados', letra: 'f', etiqueta: 'Bienes que tras la entrega se hayan mezclado de forma indisociable con otros' },
  { codigo: 'bebidas_alcoholicas', letra: 'g', etiqueta: 'Bebidas alcohólicas cuyo precio se acordó al contratar y se entregan pasados 30 días' },
  { codigo: 'soporte_precintado', letra: 'i', etiqueta: 'Grabaciones de audio o vídeo o programas informáticos precintados que hayan sido desprecintados' },
  { codigo: 'prensa', letra: 'j', etiqueta: 'Prensa diaria, publicaciones periódicas o revistas (salvo suscripciones)' },
  { codigo: 'contenido_digital', letra: 'm', etiqueta: 'Contenido digital sin soporte material cuya ejecución haya comenzado con consentimiento del consumidor' },
] as const;

export type CodigoArt103 = (typeof SUPUESTOS_ART_103)[number]['codigo'];

export const CODIGOS_ART_103 = SUPUESTOS_ART_103.map((s) => s.codigo) as [CodigoArt103, ...CodigoArt103[]];

export function etiquetaArt103(codigo: CodigoArt103): string {
  const s = SUPUESTOS_ART_103.find((x) => x.codigo === codigo);
  return s ? `${s.etiqueta} (art. 103.${s.letra})` : codigo;
}
