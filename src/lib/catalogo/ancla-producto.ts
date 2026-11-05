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

/** El `id` real que instala `instalarIdAnclaProducto` sobre la primera card coincidente. */
export function idAnclaProducto(slug: string): string {
  return `${PREFIJO}${slug}`;
}

/**
 * Instala `id="producto-<slug>"` en la primera card que coincida con el hash de
 * la URL actual. La ancla canónica sigue siendo el `data-` (un producto puede
 * pintarse varias veces y los `id` deben ser únicos); solo la PRIMERA
 * coincidente recibe el `id`, así que no hay colisiones.
 *
 * POR QUÉ hace falta un `id` real, además del scroll manual: el handler de
 * scroll de la App Router (layout-router de Next 16) procesa el hash con
 * `document.getElementById(hash)` y, si NO lo encuentra, hace fallback a
 * `scrollIntoView()` sobre la raíz del segmento — es decir, un scroll al top
 * de la página. Con el `data-` a secas ese fallback caía en el top, y en
 * navegaciones con el RSC en dos commits (prefetch parcial + useDeferredValue)
 * podía reconsumir el scroll pendiente DESPUÉS del scroll manual, anulándolo:
 * por eso volvía a veces al top y a veces no. Con el `id` instalado en un
 * `useLayoutEffect` (los layout effects corren antes que el handler del
 * segmento, que es su ancestro), el `getElementById` del handler cruzado
 * encuentra la card y su scroll nativo apunta al producto, no al top.
 */
export function instalarIdAnclaProducto(): void {
  const slug = slugDesdeHash(globalThis.location.hash);
  if (slug === null) return;
  const id = idAnclaProducto(slug);
  // Ya instalado (StrictMode ejecuta el layout effect dos veces; también
  // protege contra un id preexistente por construcción externa).
  if (document.getElementById(id) !== null) return;
  const card = document.querySelector<HTMLElement>(`[${ATRIBUTO_ANCLA_PRODUCTO}="${CSS.escape(slug)}"]`);
  if (card === null) return;
  card.id = id;
}
