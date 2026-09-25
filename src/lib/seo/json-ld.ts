import type { EmpresaPublic } from "@/core/domain/entities/types";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";
import { getAvailableLangs, getPrimaryLang } from "@/lib/seo/tenant-seo";
import { t } from "@/lib/translations";

// Datos estructurados schema.org por tenant, en un unico @graph enlazado por
// @id (negocio ↔ web ↔ carta). Funciones puras; tests en
// tests/compliance/json-ld.test.ts.
//
// SIN FAQPage a proposito: Google exige que el marcado describa contenido
// VISIBLE en la pagina, y aquellas preguntas genericas no se pintaban en
// ninguna parte (ademas afirmaban cosas, como el pago en efectivo, que no
// son ciertas para todos los tenants). Es motivo de accion manual por
// "structured data spam".

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

function coordenadasValidas(lat: number, lng: number): GeoCoordinates | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)`;

// Orden de prueba: el primero que casa gana.
// - `!3d<lat>!4d<lng>`: pin exacto de una URL de lugar de Google Maps.
// - `!2d<lng>!3d<lat>`: centro del iframe de "Insertar un mapa" (lo que
//   guarda el admin en url_mapa, porque es lo que se pinta en el iframe).
// - `@lat,lng`: URL de navegador.
// - `q=`/`ll=`/`query=lat,lng`: URLs de busqueda/enlaces cortos expandidos.
const PATRONES_GEO: ReadonlyArray<{ re: RegExp; orden: "latlng" | "lnglat" }> = [
  { re: new RegExp(String.raw`!3d${NUM}!4d${NUM}`), orden: "latlng" },
  { re: new RegExp(String.raw`!2d${NUM}!3d${NUM}`), orden: "lnglat" },
  { re: new RegExp(String.raw`@${NUM},${NUM}`), orden: "latlng" },
  { re: new RegExp(String.raw`[?&](?:q|ll|query|center)=${NUM}(?:,|%2C)\s*${NUM}`, "i"), orden: "latlng" },
];

export function parseGeoFromUrl(urlMapa: string | null | undefined): GeoCoordinates | null {
  if (!urlMapa) return null;
  for (const { re, orden } of PATRONES_GEO) {
    const match = re.exec(urlMapa);
    if (!match) continue;
    const a = Number.parseFloat(match[1]);
    const b = Number.parseFloat(match[2]);
    const geo = orden === "latlng" ? coordenadasValidas(a, b) : coordenadasValidas(b, a);
    if (geo) return geo;
  }
  const lat = /[?&]lat=(-?\d+(?:\.\d+)?)/i.exec(urlMapa);
  const lng = /[?&](?:lng|lon)=(-?\d+(?:\.\d+)?)/i.exec(urlMapa);
  if (lat && lng) return coordenadasValidas(Number.parseFloat(lat[1]), Number.parseFloat(lng[1]));
  return null;
}

/** Solo URLs absolutas http(s): schema.org no acepta rutas relativas ni `javascript:`. */
function urlAbsoluta(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function businessId(baseUrl: string): string {
  return `${baseUrl}/#negocio`;
}

function websiteId(baseUrl: string): string {
  return `${baseUrl}/#website`;
}

function menuId(baseUrl: string): string {
  return `${baseUrl}/carta#menu`;
}

export function buildBusinessNode(
  empresa: EmpresaPublic,
  baseUrl: string,
  conMenu: boolean
): Record<string, unknown> {
  const esTienda = empresa.tipo === "tienda";
  const lang = getPrimaryLang(empresa);
  const node: Record<string, unknown> = {
    "@type": esTienda ? "Store" : "Restaurant",
    "@id": businessId(baseUrl),
    name: empresa.nombre,
    url: `${baseUrl}/`,
  };

  const descripcion = empresa.descripcion?.[lang]?.trim();
  if (descripcion) node.description = descripcion;

  const logo = urlAbsoluta(empresa.logoUrl);
  const imagen = urlAbsoluta(empresa.urlImage) ?? logo;
  if (logo) node.logo = logo;
  if (imagen) node.image = imagen;
  if (empresa.telefono) node.telephone = empresa.telefono;
  if (empresa.direccion) {
    node.address = { "@type": "PostalAddress", streetAddress: empresa.direccion };
  }

  const geo = parseGeoFromUrl(empresa.urlMapa);
  if (geo) node.geo = { "@type": "GeoCoordinates", ...geo };

  const sameAs = [empresa.fb, empresa.instagram].map(urlAbsoluta).filter((u): u is string => u !== null);
  if (sameAs.length > 0) node.sameAs = sameAs;

  if (!esTienda) {
    // Con la carta ya en la pagina se enlaza el nodo Menu; si no, su URL.
    node.hasMenu = conMenu ? { "@id": menuId(baseUrl) } : `${baseUrl}/carta`;
  }

  return node;
}

export function buildWebSiteNode(empresa: EmpresaPublic, baseUrl: string): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": websiteId(baseUrl),
    url: `${baseUrl}/`,
    name: empresa.nombre,
    inLanguage: getAvailableLangs(empresa),
    publisher: { "@id": businessId(baseUrl) },
  };
}

export function buildMenuNode(
  empresa: EmpresaPublic,
  menuData: MenuCategoryVM[],
  baseUrl: string
): Record<string, unknown> {
  const lang = getPrimaryLang(empresa);
  const moneda = empresa.moneda || "EUR";
  return {
    "@type": "Menu",
    "@id": menuId(baseUrl),
    name: `${t("nuestraCarta", lang)} · ${empresa.nombre}`,
    url: `${baseUrl}/carta`,
    inLanguage: lang,
    hasMenuSection: menuData.map((category) => ({
      "@type": "MenuSection",
      name: category.label,
      hasMenuItem: category.items.map((item) => {
        const menuItem: Record<string, unknown> = { "@type": "MenuItem", name: item.name };
        if (item.description) menuItem.description = item.description;
        const imagen = urlAbsoluta(item.image);
        if (imagen) menuItem.image = imagen;
        menuItem.offers = { "@type": "Offer", price: item.price, priceCurrency: moneda };
        return menuItem;
      }),
    })),
  };
}

export function buildJsonLdGraph(
  empresa: EmpresaPublic,
  menuData: MenuCategoryVM[],
  baseUrl: string
): Record<string, unknown> {
  const conMenu = empresa.tipo !== "tienda" && menuData.length > 0;
  const graph = [buildBusinessNode(empresa, baseUrl, conMenu), buildWebSiteNode(empresa, baseUrl)];
  if (conMenu) graph.push(buildMenuNode(empresa, menuData, baseUrl));
  return { "@context": "https://schema.org", "@graph": graph };
}

/** JSON seguro dentro de `<script>`: escapa `<`, `>` y `&` para que no cierre la etiqueta. */
export function safeJsonStringify(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
