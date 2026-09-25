import type { Language } from "@/lib/language-context";

interface TranslatableTextValue {
  es?: string | null;
  en?: string | null;
  fr?: string | null;
  it?: string | null;
  de?: string | null;
}

export function readTranslatable(
  contenido: Record<string, unknown>,
  key: string,
  language: Language
): string | null {
  const value = contenido[key] as TranslatableTextValue | undefined;
  if (!value || typeof value !== "object") return null;
  return value[language] ?? value.es ?? null;
}
