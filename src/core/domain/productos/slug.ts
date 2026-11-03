/**
 * Slug de producto — módulo de dominio puro (product-detail-pages PR1).
 *
 * Sin imports de Node ni de Supabase: lo reutilizan tanto el caso de uso de
 * productos como el script de backfill (PR2), que corre fuera de Next.
 * El slug se genera en TypeScript y no en SQL porque `unaccent` no está
 * instalado en este proyecto y una segunda implementación en PL/pgSQL
 * divergiría de esta tarde o temprano.
 */

export const SLUG_MAX = 64;
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DIACRITICS = /[̀-ͯ]/g;
const NON_ALNUM = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

/**
 * Normaliza un título a un slug URL-safe: NFD + strip de diacríticos,
 * minúsculas, todo lo que no sea [a-z0-9] colapsa a un único guión, recorta
 * a SLUG_MAX. Si el resultado queda vacío (p. ej. un título solo de
 * emojis) cae en el literal "producto".
 */
export function slugify(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALNUM, '-')
    .replace(EDGE_HYPHENS, '');

  const truncado = base.slice(0, SLUG_MAX).replace(EDGE_HYPHENS, '');
  return truncado || 'producto';
}

/**
 * Dado un slug base y el conjunto de slugs ya ocupados (scoped a un solo
 * empresa_id por el llamador), devuelve el primer slug libre: el propio
 * base o, si colisiona, base-2, base-3... El base se trunca si hiciera
 * falta para que el slug con sufijo nunca supere SLUG_MAX.
 */
export function siguienteSlugLibre(base: string, ocupados: ReadonlySet<string>): string {
  if (!ocupados.has(base)) return base;

  for (let n = 2; n < Number.MAX_SAFE_INTEGER; n += 1) {
    const sufijo = `-${n}`;
    const candidato = `${base.slice(0, SLUG_MAX - sufijo.length)}${sufijo}`;
    if (!ocupados.has(candidato)) return candidato;
  }

  // Inalcanzable en la práctica (requeriría MAX_SAFE_INTEGER colisiones);
  // solo satisface a TS sobre un camino de retorno.
  return base;
}
