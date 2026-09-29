const SRC_DE_IFRAME = /<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i;

/**
 * Google Maps → Compartir → "Insertar un mapa" da el <iframe> entero; en
 * `url_mapa` se guarda solo su `src`. Si el texto no es un iframe se devuelve
 * tal cual (recortado) para que lo valide el formulario.
 */
export function extraerUrlMapa(valor: string): string {
  const match = SRC_DE_IFRAME.exec(valor);
  if (match === null) return valor.trim();
  return match[2].replaceAll('&amp;', '&').trim();
}
