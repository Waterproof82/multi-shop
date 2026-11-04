/**
 * Ancla de una card de producto en /carta, para que "Volver a la carta" desde
 * /producto/[slug] deje al usuario donde estaba y no arriba del todo.
 *
 * Va en un `data-` y no en un `id`: un producto puede pintarse varias veces
 * (su categoría real + menús virtuales) y los `id` deben ser únicos.
 */
const PREFIJO = "producto-";

/** Debe coincidir con el `data-producto-slug` de la card en `menu-section.tsx`. */
export const ATRIBUTO_ANCLA_PRODUCTO = "data-producto-slug";

export function hrefVolverACarta(slug: string | undefined): string {
  return slug ? `/carta#${PREFIJO}${encodeURIComponent(slug)}` : "/carta";
}

export function slugDesdeHash(hash: string): string | null {
  const marca = `#${PREFIJO}`;
  if (!hash.startsWith(marca) || hash.length === marca.length) return null;
  try {
    return decodeURIComponent(hash.slice(marca.length));
  } catch {
    return null;
  }
}
