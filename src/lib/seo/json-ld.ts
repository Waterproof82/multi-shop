import type { EmpresaPublic } from "@/core/domain/entities/types";
import type { MenuCategoryVM, MenuItemVM } from "@/core/application/dtos/menu-view-model";
import type { ModalidadDomicilioLegal } from "@/core/domain/entities/empresa-legal";
import { MIN_DESISTIMIENTO_DIAS } from "@/core/domain/legal/constantes";
import { getAvailableLangs, getPrimaryLang } from "@/lib/seo/tenant-seo";
import { t } from "@/lib/translations";
import { mapsSearchUrl } from "@/components/landing/landing-ui";

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

/**
 * `priceRange` a partir de la carta real ("5,00 € – 24,00 €"): un dato
 * factual que los asistentes citan al responder "¿es caro?". Sin precios
 * validos, null (no se inventa).
 */
export function rangoDePrecios(menuData: MenuCategoryVM[], moneda: string): string | null {
  const precios = menuData
    .flatMap((c) => c.items.map((i) => i.price))
    .filter((p) => Number.isFinite(p) && p > 0);
  if (precios.length === 0) return null;
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda });
  } catch {
    return null;
  }
  const min = fmt.format(Math.min(...precios));
  const max = fmt.format(Math.max(...precios));
  return min === max ? min : `${min} – ${max}`;
}

export function buildBusinessNode(
  empresa: EmpresaPublic,
  baseUrl: string,
  conMenu: boolean,
  menuData: MenuCategoryVM[] = []
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
  const mapa = mapsSearchUrl(empresa.direccion, empresa.nombre);
  if (mapa) node.hasMap = mapa;

  const moneda = empresa.moneda || "EUR";
  node.currenciesAccepted = moneda;
  const rango = rangoDePrecios(menuData, moneda);
  if (rango) node.priceRange = rango;

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
  const graph = [buildBusinessNode(empresa, baseUrl, conMenu, menuData), buildWebSiteNode(empresa, baseUrl)];
  if (conMenu) graph.push(buildMenuNode(empresa, menuData, baseUrl));
  return { "@context": "https://schema.org", "@graph": graph };
}

export function productUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/producto/${slug}`;
}

function productId(baseUrl: string, slug: string): string {
  return `${productUrl(baseUrl, slug)}#producto`;
}

/**
 * Un `OfferShippingDetails` por cada modalidad de envío a domicilio activa.
 * `transitTime` solo se emite si la modalidad tiene `tiempoMin` configurado
 * (en minutos, por eso el techo a días: `ceil(min / 1440)`) — un dato sin
 * configurar no se inventa.
 */
function buildShippingDetail(modalidad: ModalidadDomicilioLegal, moneda: string): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: modalidad.precioCents / 100, currency: moneda },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "ES" },
  };
  if (modalidad.tiempoMin != null) {
    detail.deliveryTime = {
      "@type": "ShippingDeliveryTime",
      transitTime: { "@type": "QuantitativeValue", value: Math.ceil(modalidad.tiempoMin / 1440), unitCode: "DAY" },
    };
  }
  return detail;
}

/**
 * `MerchantReturnPolicy` desde el plazo de desistimiento legal del tenant
 * (`plazoDesistimientoDias`, art. 104 TRLGDCU), NUNCA desde `garantiasVisibles()`
 * (esa es la garantía legal de producto, un concepto distinto — corrección F3
 * del diseño). El suelo de `MIN_DESISTIMIENTO_DIAS` es defensa en profundidad:
 * el DTO de `empresa_legal` ya impide guardar menos de 14 días.
 */
function buildMerchantReturnPolicy(baseUrl: string, plazoDesistimientoDias: number): Record<string, unknown> {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "ES",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: Math.max(MIN_DESISTIMIENTO_DIAS, plazoDesistimientoDias),
    returnMethod: "https://schema.org/ReturnByMail",
    merchantReturnLink: `${baseUrl}/devoluciones`,
  };
}

/**
 * Product + Offer de un producto de tienda. `null` cuando no corresponde
 * emitir JSON-LD: sin slug (no tiene página propia) o con `canonicalExterno`
 * (la página es `noindex` con canonical hacia fuera — emitir Product ahí
 * mandaría una señal contradictoria).
 *
 * `availability` es siempre `InStock`: `item` viene de `getCachedMenu`, que
 * ya filtra productos inactivos (`GetMenuUseCase`) — todo producto alcanzable
 * aquí está activo. Es una simplificación documentada (F5), no un chequeo
 * real de stock (este sistema no modela inventario).
 */
export function buildProductNode(
  item: MenuItemVM,
  empresa: EmpresaPublic,
  baseUrl: string,
  modalidadesDomicilio: ModalidadDomicilioLegal[],
  plazoDesistimientoDias: number
): Record<string, unknown> | null {
  if (!item.slug || item.canonicalExterno) return null;

  const url = productUrl(baseUrl, item.slug);
  const moneda = empresa.moneda || "EUR";
  const imagenes = [item.image, item.image2].map(urlAbsoluta).filter((u): u is string => u !== null);

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    price: item.price,
    priceCurrency: moneda,
    availability: "https://schema.org/InStock",
    seller: { "@id": businessId(baseUrl) },
    hasMerchantReturnPolicy: buildMerchantReturnPolicy(baseUrl, plazoDesistimientoDias),
  };

  const shippingDetails = modalidadesDomicilio.map((m) => buildShippingDetail(m, moneda));
  if (shippingDetails.length > 0) offer.shippingDetails = shippingDetails;

  const node: Record<string, unknown> = {
    "@type": "Product",
    "@id": productId(baseUrl, item.slug),
    name: item.name,
    url,
    offers: offer,
  };
  if (item.description) node.description = item.description;
  if (imagenes.length > 0) node.image = imagenes;

  return node;
}

/** `[Store, WebSite, Product?]` — el mismo `@graph` enlazado por `@id` que `buildJsonLdGraph`, con el Product de la página en vez del Menu. */
export function buildProductJsonLdGraph(
  item: MenuItemVM,
  empresa: EmpresaPublic,
  baseUrl: string,
  modalidadesDomicilio: ModalidadDomicilioLegal[],
  plazoDesistimientoDias: number
): Record<string, unknown> {
  const graph = [buildBusinessNode(empresa, baseUrl, false, []), buildWebSiteNode(empresa, baseUrl)];
  const productNode = buildProductNode(item, empresa, baseUrl, modalidadesDomicilio, plazoDesistimientoDias);
  if (productNode) graph.push(productNode);
  return { "@context": "https://schema.org", "@graph": graph };
}

/** JSON seguro dentro de `<script>`: escapa `<`, `>` y `&` para que no cierre la etiqueta. */
export function safeJsonStringify(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
