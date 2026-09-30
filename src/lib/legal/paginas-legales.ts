import type { t } from '@/lib/translations';

export type SlugLegal = 'aviso-legal' | 'privacidad' | 'condiciones' | 'envios-y-pagos' | 'devoluciones';

type ClaveTraduccion = Parameters<typeof t>[0];

export interface PaginaLegal {
  readonly slug: SlugLegal;
  readonly href: `/${SlugLegal}`;
  readonly labelKey: ClaveTraduccion;
}

/** Subconjunto de EmpresaPublic: el footer (cliente) y el servidor lo tienen. */
export interface FlagsPaginas {
  readonly tipo: string | null;
  readonly deliveryHabilitado: boolean;
  readonly envioDomicilioHabilitado: boolean;
}

interface Regla {
  readonly slug: SlugLegal;
  readonly labelKey: ClaveTraduccion;
  readonly aplica: (f: FlagsPaginas) => boolean;
}

const siempre = () => true;
const esTienda = (f: FlagsPaginas) => f.tipo === 'tienda';

/**
 * El ORDEN de esta tabla es el orden del footer y del sitemap.
 * Restaurante nunca tiene envíos/devoluciones: vende perecederos (art. 103.d
 * TRLGDCU) y su reparto (Glovo) se explica dentro de /condiciones.
 */
const REGLAS: readonly Regla[] = [
  { slug: 'aviso-legal', labelKey: 'footerLegalNotice', aplica: siempre },
  { slug: 'privacidad', labelKey: 'footerPrivacy', aplica: siempre },
  { slug: 'condiciones', labelKey: 'footerTerms', aplica: siempre },
  { slug: 'envios-y-pagos', labelKey: 'footerShipping', aplica: (f) => esTienda(f) && f.envioDomicilioHabilitado },
  { slug: 'devoluciones', labelKey: 'footerReturns', aplica: esTienda },
];

export function paginasLegalesDe(flags: FlagsPaginas): PaginaLegal[] {
  return REGLAS.filter((r) => r.aplica(flags)).map((r) => ({ slug: r.slug, href: `/${r.slug}` as const, labelKey: r.labelKey }));
}

export function aplicaPagina(flags: FlagsPaginas, slug: SlugLegal): boolean {
  return REGLAS.some((r) => r.slug === slug && r.aplica(flags));
}
