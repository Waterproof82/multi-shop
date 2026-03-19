export interface CountryCode {
  code: string;
  dialCode: string;
  flag: string;
  name: string;
}

export const DEFAULT_COUNTRY_CODE = 'ES';

export const COUNTRY_CODES: CountryCode[] = [
  { code: 'ES', dialCode: '34', flag: '\u{1F1EA}\u{1F1F8}', name: 'España' },
  { code: 'FR', dialCode: '33', flag: '\u{1F1EB}\u{1F1F7}', name: 'France' },
  { code: 'IT', dialCode: '39', flag: '\u{1F1EE}\u{1F1F9}', name: 'Italia' },
  { code: 'DE', dialCode: '49', flag: '\u{1F1E9}\u{1F1EA}', name: 'Deutschland' },
  { code: 'PT', dialCode: '351', flag: '\u{1F1F5}\u{1F1F9}', name: 'Portugal' },
  { code: 'GB', dialCode: '44', flag: '\u{1F1EC}\u{1F1E7}', name: 'United Kingdom' },
  { code: 'US', dialCode: '1', flag: '\u{1F1FA}\u{1F1F8}', name: 'United States' },
  { code: 'MX', dialCode: '52', flag: '\u{1F1F2}\u{1F1FD}', name: 'México' },
  { code: 'AR', dialCode: '54', flag: '\u{1F1E6}\u{1F1F7}', name: 'Argentina' },
  { code: 'CO', dialCode: '57', flag: '\u{1F1E8}\u{1F1F4}', name: 'Colombia' },
  { code: 'CL', dialCode: '56', flag: '\u{1F1E8}\u{1F1F1}', name: 'Chile' },
  { code: 'PE', dialCode: '51', flag: '\u{1F1F5}\u{1F1EA}', name: 'Perú' },
  { code: 'BR', dialCode: '55', flag: '\u{1F1E7}\u{1F1F7}', name: 'Brasil' },
  { code: 'MA', dialCode: '212', flag: '\u{1F1F2}\u{1F1E6}', name: 'Morocco' },
  { code: 'RO', dialCode: '40', flag: '\u{1F1F7}\u{1F1F4}', name: 'România' },
];
