import type { Metadata } from "next";
import type { EmpresaPublic } from "@/core/domain/entities/types";

// Metadatos SEO por tenant. Funciones puras: sin Next ni BBDD, testeables.
//
// Reglas que fijan (tests en tests/compliance/tenant-seo.test.ts):
// - El canonical es de CADA página, nunca del layout raíz. Un canonical "/"
//   heredado desde el layout hacía que /carta, /privacidad... se declarasen
//   duplicados de la home y Google los descartara del índice.
// - Las variantes de idioma son `?lang=xx` (LanguageProvider la aplica al
//   cargar). Cada variante es canonical de sí misma y todas se enlazan entre
//   sí con hreflang + x-default; un hreflang que apunta a una URL con otro
//   canonical se ignora.

export type LangKey = "es" | "en" | "fr" | "it" | "de";
export const LANG_KEYS: readonly LangKey[] = ["es", "en", "fr", "it", "de"];

export const LOCALE_MAP: Record<LangKey, string> = {
  es: "es_ES",
  en: "en_US",
  fr: "fr_FR",
  it: "it_IT",
  de: "de_DE",
};

export const FALLBACK_DESCRIPTIONS: Record<LangKey, string> = {
  es: "Carta digital y pedidos online: consulta nuestro catálogo, pide a domicilio o para recoger.",
  en: "Digital menu and online ordering: browse our catalogue, order for delivery or pickup.",
  fr: "Menu numérique et commandes en ligne : consultez notre catalogue, commandez en livraison ou à emporter.",
  it: "Menu digitale e ordini online: consulta il nostro catalogo, ordina con consegna o ritiro.",
  de: "Digitale Speisekarte und Online-Bestellung: Katalog ansehen, liefern lassen oder abholen.",
};

/** Largo máximo de meta description que Google suele mostrar sin cortar. */
export const MAX_DESCRIPTION = 160;

export function isLangKey(value: unknown): value is LangKey {
  return typeof value === "string" && (LANG_KEYS as readonly string[]).includes(value);
}

/** Idioma pedido por `?lang=xx`, o null si falta o no es soportado. */
export function parseLangParam(value: string | string[] | undefined): LangKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return isLangKey(raw) ? raw : null;
}

export function getPrimaryLang(empresa: EmpresaPublic | null): LangKey {
  if (!empresa?.descripcion) return "es";
  for (const lang of LANG_KEYS) {
    if (empresa.descripcion[lang]) return lang;
  }
  return "es";
}

/** Idiomas con descripción propia del tenant (siempre al menos el principal). */
export function getAvailableLangs(empresa: EmpresaPublic | null): LangKey[] {
  if (!empresa?.descripcion) return ["es"];
  const available = LANG_KEYS.filter((l) => empresa.descripcion?.[l]);
  return available.length > 0 ? available : ["es"];
}

/**
 * Recorta a `max` caracteres sin partir palabras, añadiendo "…". Colapsa
 * saltos de línea y espacios repetidos (el texto viene de un textarea).
 */
export function recortarDescripcion(texto: string, max: number = MAX_DESCRIPTION): string {
  const limpio = texto.replaceAll(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const ultimoEspacio = corte.lastIndexOf(" ");
  const base = ultimoEspacio > max * 0.6 ? corte.slice(0, ultimoEspacio) : corte;
  return `${base.replace(/[\s.,;:–—-]+$/, "")}…`;
}

export function getDescriptionForLang(empresa: EmpresaPublic | null, lang: LangKey): string {
  const propia = empresa?.descripcion?.[lang];
  if (propia?.trim()) return recortarDescripcion(propia);
  return FALLBACK_DESCRIPTIONS[lang];
}

function urlParaIdioma(path: string, lang: LangKey, primaryLang: LangKey): string {
  return lang === primaryLang ? path : `${path}?lang=${lang}`;
}

/**
 * Idioma efectivo de la página: el de `?lang=` solo si el tenant lo tiene
 * disponible; si no, el principal (así `?lang=` inventados no crean URLs
 * canónicas nuevas).
 */
export function resolverIdiomaPagina(
  langParam: LangKey | null,
  availableLangs: readonly LangKey[],
  primaryLang: LangKey
): LangKey {
  if (langParam && availableLangs.includes(langParam)) return langParam;
  return primaryLang;
}

function paramPresente(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
}

/**
 * URLs efimeras que no deben indexarse: `?mesa=` (carta de UNA mesa) y
 * `?carrito=` (el FAB de la landing abriendo el carrito: estado de UI). Mismas
 * que bloquea robots.ts; el noindex cubre el caso de que se indexen igualmente
 * por enlaces externos sin haberse rastreado.
 */
export function debeDesindexar(params: Record<string, string | string[] | undefined>): boolean {
  return paramPresente(params.mesa) || paramPresente(params.carrito);
}

export interface Alternates {
  canonical: string;
  languages: Record<string, string>;
}

export function buildAlternates(
  path: string,
  availableLangs: readonly LangKey[],
  primaryLang: LangKey,
  currentLang: LangKey
): Alternates {
  const languages: Record<string, string> = {};
  if (availableLangs.length > 1) {
    for (const lang of availableLangs) {
      languages[lang] = urlParaIdioma(path, lang, primaryLang);
    }
    languages["x-default"] = path;
  }
  return { canonical: urlParaIdioma(path, currentLang, primaryLang), languages };
}

export interface TenantPageMetadataInput {
  empresa: EmpresaPublic;
  /** Ruta de la página sin query (p. ej. "/" o "/carta"). */
  path: string;
  /** Valor crudo de `?lang=`. */
  langParam: string | string[] | undefined;
  /** Título de la página en el idioma dado. Sin él se usa el nombre de la empresa. */
  titulo?: (lang: LangKey) => string;
  /** true → noindex (URLs de mesa, modo camarero...). */
  noIndex?: boolean;
}

export function buildTenantPageMetadata({
  empresa,
  path,
  langParam,
  titulo,
  noIndex = false,
}: TenantPageMetadataInput): Metadata {
  const primaryLang = getPrimaryLang(empresa);
  const availableLangs = getAvailableLangs(empresa);
  const lang = resolverIdiomaPagina(parseLangParam(langParam), availableLangs, primaryLang);
  const alternates = buildAlternates(path, availableLangs, primaryLang, lang);
  const description = getDescriptionForLang(empresa, lang);
  const title = titulo ? `${titulo(lang)} | ${empresa.nombre}` : empresa.nombre;
  const ogImage = empresa.urlImage || empresa.logoUrl || null;

  return {
    title: { absolute: title },
    description,
    robots: noIndex
      ? { index: false, follow: true }
      : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      siteName: empresa.nombre,
      type: "website",
      locale: LOCALE_MAP[lang],
      alternateLocale: availableLangs.filter((l) => l !== lang).map((l) => LOCALE_MAP[l]),
      ...(ogImage ? { images: [{ url: ogImage, alt: empresa.nombre }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
