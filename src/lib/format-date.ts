function getLocaleFromLanguage(language: string): string {
  switch (language) {
    case 'en': return 'en-US';
    case 'fr': return 'fr-FR';
    case 'it': return 'it-IT';
    case 'de': return 'de-DE';
    default: return 'es-ES';
  }
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions, language = 'es'): string {
  const locale = getLocaleFromLanguage(language);
  return new Intl.DateTimeFormat(locale, options).format(new Date(date));
}

export function formatDateTime(date: Date | string, language = 'es'): string {
  const locale = getLocaleFromLanguage(language);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
