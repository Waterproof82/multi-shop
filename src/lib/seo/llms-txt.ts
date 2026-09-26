import type { EmpresaPublic, LandingSeccion } from "@/core/domain/entities/types";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";
import { getAvailableLangs, getPrimaryLang, type LangKey } from "@/lib/seo/tenant-seo";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

// /llms.txt por tenant (formato https://llmstxt.org): resumen en Markdown que
// los asistentes de IA (ChatGPT, Perplexity, Claude, Gemini...) leen para
// responder "¿que hay en la carta de X?", "¿a que hora abre?"... sin tener que
// ejecutar el JavaScript de la landing. Es GEO, no SEO clasico: Google no lo
// usa para posicionar.
//
// Solo datos que YA son publicos en la web (nombre, direccion, telefono del
// negocio, horario, carta). Nada de emails ni datos de clientes.

/** Tope de platos listados: el fichero debe caber holgado en un contexto. */
export const MAX_ITEMS_LLMS = 300;

const IDIOMA_NOMBRE: Record<LangKey, string> = {
  es: "español",
  en: "English",
  fr: "français",
  it: "italiano",
  de: "Deutsch",
};

/** Una linea: sin saltos, sin marcado de resaltado (`*`), sin espacios dobles. */
export function lineaPlana(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto.replaceAll("*", "").replaceAll(/\s+/g, " ").trim();
}

function formatearPrecio(precio: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda }).format(precio);
  } catch {
    return `${precio.toFixed(2)} ${moneda}`;
  }
}

function horarioDe(secciones: LandingSeccion[], lang: LangKey): string | null {
  for (const tipo of ["visitanos", "hero"] as const) {
    const seccion = secciones.find((s) => s.tipo === tipo);
    const horario = seccion ? lineaPlana(readTranslatable(seccion.contenido, "horario", lang)) : "";
    if (horario) return horario;
  }
  return null;
}

function sobreNosotros(secciones: LandingSeccion[], lang: LangKey): string | null {
  const nosotros = secciones.find((s) => s.tipo === "nosotros");
  if (!nosotros) return null;
  return lineaPlana(readTranslatable(nosotros.contenido, "descripcion", lang)) || null;
}

function bloqueDatos(empresa: EmpresaPublic, secciones: LandingSeccion[], lang: LangKey): string[] {
  const lineas: string[] = [];
  lineas.push(`- Tipo: ${empresa.tipo === "tienda" ? "tienda" : "restaurante"}`);
  if (empresa.direccion) lineas.push(`- Dirección: ${lineaPlana(empresa.direccion)}`);
  if (empresa.telefono) lineas.push(`- Teléfono: ${lineaPlana(empresa.telefono)}`);
  const horario = horarioDe(secciones, lang);
  if (horario) lineas.push(`- Horario: ${horario}`);
  const idiomas = getAvailableLangs(empresa).map((l) => IDIOMA_NOMBRE[l]);
  lineas.push(`- Idiomas de la web: ${idiomas.join(", ")}`);
  if (empresa.instagram) lineas.push(`- Instagram: ${empresa.instagram}`);
  if (empresa.fb) lineas.push(`- Facebook: ${empresa.fb}`);
  return lineas;
}

function bloqueCarta(menu: MenuCategoryVM[], moneda: string): string[] {
  const lineas: string[] = [];
  let restantes = MAX_ITEMS_LLMS;
  for (const categoria of menu) {
    if (restantes <= 0) break;
    const items = categoria.items.slice(0, restantes);
    if (items.length === 0) continue;
    restantes -= items.length;
    lineas.push("", `### ${lineaPlana(categoria.label)}`, "");
    for (const item of items) {
      const descripcion = lineaPlana(item.description);
      const sufijo = descripcion ? `: ${descripcion}` : "";
      lineas.push(`- ${lineaPlana(item.name)} — ${formatearPrecio(item.price, moneda)}${sufijo}`);
    }
  }
  if (restantes <= 0) lineas.push("", "(Carta resumida; la lista completa está en la página de la carta.)");
  return lineas;
}

export interface LlmsTxtInput {
  empresa: EmpresaPublic;
  secciones: LandingSeccion[];
  menu: MenuCategoryVM[];
  baseUrl: string;
}

export function buildLlmsTxt({ empresa, secciones, menu, baseUrl }: LlmsTxtInput): string {
  const lang = getPrimaryLang(empresa);
  const descripcion = lineaPlana(empresa.descripcion?.[lang]);
  const resumen = descripcion || `${empresa.nombre}: ${t("nuestraCarta", lang).toLowerCase()} online y pedidos.`;
  const nosotros = sobreNosotros(secciones, lang);
  const moneda = empresa.moneda || "EUR";

  const lineas: string[] = [`# ${lineaPlana(empresa.nombre)}`, "", `> ${resumen}`, ""];
  if (nosotros && nosotros !== descripcion) lineas.push(nosotros, "");
  lineas.push(...bloqueDatos(empresa, secciones, lang));

  lineas.push(
    "",
    "## Páginas",
    "",
    `- [Inicio](${baseUrl}/): presentación del negocio, ubicación y contacto`,
    `- [${t("nuestraCarta", lang)}](${baseUrl}/carta): productos y precios`
  );

  if (menu.length > 0) {
    lineas.push("", `## ${t("nuestraCarta", lang)}`, "", `Precios en ${moneda}.`);
    lineas.push(...bloqueCarta(menu, moneda));
  }

  lineas.push("", "## Optional", "", `- [Política de privacidad](${baseUrl}/privacidad)`, "");
  return lineas.join("\n");
}
