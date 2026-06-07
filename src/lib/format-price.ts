function getLocaleFromLanguage(language: string): string {
  switch (language) {
    case 'en': return 'en-US';
    case 'fr': return 'fr-FR';
    case 'it': return 'it-IT';
    case 'de': return 'de-DE';
    default: return 'es-ES';
  }
}

export function formatPrice(amount: number, currency = 'EUR', language = 'es'): string {
  const locale = getLocaleFromLanguage(language);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
