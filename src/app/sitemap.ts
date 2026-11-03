import type { MetadataRoute } from "next";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getCachedMenu, resolverEmpresaPublica } from "@/lib/server-services";
import { buildAlternates, getAvailableLangs, getPrimaryLang } from "@/lib/seo/tenant-seo";
import { paginasLegalesDe } from "@/lib/legal/paginas-legales";
import { productosIndexables } from "@/lib/catalogo/productos-publicos";

// Sin `lastModified` a proposito: no hay una fecha real de ultima edicion de
// la landing/carta, y Google deja de fiarse del <lastmod> de un sitemap que
// siempre dice "ahora mismo".
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const domain = await getDomainFromHeaders();
  const baseUrl = domain ? `https://${domain}` : "https://localhost:3000";
  const { empresa } = await resolverEmpresaPublica(domain);
  if (!empresa) return [];

  const primaryLang = getPrimaryLang(empresa);
  const availableLangs = getAvailableLangs(empresa);

  // `multilingue`: la pagina tiene variantes `?lang=` (las de cliente; las
  // paginas legales se sirven solo en castellano).
  function entrada(path: string, priority: number, multilingue: boolean): MetadataRoute.Sitemap[number] {
    const langs = multilingue ? availableLangs : [primaryLang];
    const { canonical, languages } = buildAlternates(path, langs, primaryLang, primaryLang);
    const absolutas = Object.fromEntries(
      Object.entries(languages).map(([lang, ruta]) => [lang, `${baseUrl}${ruta}`])
    );
    return {
      url: `${baseUrl}${canonical}`,
      changeFrequency: "weekly",
      priority,
      ...(Object.keys(absolutas).length > 0 ? { alternates: { languages: absolutas } } : {}),
    };
  }

  const legales = paginasLegalesDe(empresa).map((p) => entrada(p.href, 0.2, false));

  // Una entrada por producto indexable (slug && !canonicalExterno): el que
  // apunta a un dominio externo (p. ej. kitemergenciacanarias.es) no tiene
  // página propia que indexar aquí (ver tenant-seo.ts buildProductPageMetadata).
  let productos: MetadataRoute.Sitemap = [];
  if (empresa.tipo === 'tienda') {
    const menuResult = await getCachedMenu(empresa.id);
    productos = productosIndexables(menuResult.data ?? []).map((item) => entrada(`/producto/${item.slug}`, 0.8, true));
  }

  return [entrada("/", 1, true), entrada("/carta", 0.9, true), ...legales, ...productos];
}
