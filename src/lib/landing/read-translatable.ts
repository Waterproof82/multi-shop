import type { Language } from "@/lib/language-context";

interface TranslatableTextValue {
  es?: string | null;
  en?: string | null;
  fr?: string | null;
  it?: string | null;
  de?: string | null;
}

// "" o solo espacios cuentan como "sin traducir": el editor deja `""` al borrar
// el texto de una pestaña de idioma, y con `??` ese hueco ganaba al español.
function textoOVacio(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Texto en `language`, o en español si ese idioma está vacío; null si ninguno. */
export function pickTranslatable(
  value: TranslatableTextValue | null | undefined,
  language: Language
): string | null {
  if (!value || typeof value !== "object") return null;
  return textoOVacio(value[language]) ?? textoOVacio(value.es);
}

export function readTranslatable(
  contenido: Record<string, unknown>,
  key: string,
  language: Language
): string | null {
  return pickTranslatable(contenido[key] as TranslatableTextValue | undefined, language);
}
