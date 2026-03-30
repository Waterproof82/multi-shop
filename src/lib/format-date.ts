const STORAGE_KEY = "preferred-language"

function getLanguage(): string {
  if (globalThis.window === undefined) return "es"
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored || "es"
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const language = getLanguage();
  const locale = getLocaleFromLanguage(language);

  return new Intl.DateTimeFormat(locale, options).format(new Date(date));
}

function getLocaleFromLanguage(language: string): string {
  switch (language) {
    case 'en': return 'en-US';
    case 'fr': return 'fr-FR';
    case 'it': return 'it-IT';
    case 'de': return 'de-DE';
    default: return 'es-ES';
  }
}

export function formatDateTime(date: Date | string): string {
  const language = getLanguage();
  const locale = getLocaleFromLanguage(language);

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}