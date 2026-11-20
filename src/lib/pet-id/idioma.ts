// src/lib/pet-id/idioma.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// DD9 (design.md): el idioma de quien escanea se resuelve EN EL SERVIDOR,
// nunca con `useLanguage()` (cliente) — así el HTML del SSR ya sale en el
// idioma correcto y no hay parpadeo ni desajuste con la hidratación.
//
// "Sin fallback incorrecto" (DD9/R-QR.6.4): el parseo ingenuo que ya existe
// en `api/descuento/subscribe/route.ts`
// (`accept-language.split(',')[0].split('-')[0]`) solo mira la PRIMERA
// entrada de la cabecera. Si el navegador manda `ca,es;q=0.9` (catalán
// primero, no soportado), ese parseo devolvería `ca`, que no es ninguno de
// los 5 idiomas — un idioma "fantasma" en vez de caer al siguiente
// preferido. `idiomaDePeticion` recorre TODAS las entradas ordenadas por
// `q` y se queda con la primera que SÍ esté soportada.
import type { Language } from '@/lib/language-context';

const IDIOMAS_SOPORTADOS = ['es', 'en', 'fr', 'it', 'de'] as const;

function esIdiomaSoportado(valor: string): valor is Language {
  return (IDIOMAS_SOPORTADOS as readonly string[]).includes(valor);
}

function idiomaValido(valor: string | null | undefined): Language | null {
  if (!valor) return null;
  const normalizado = valor.trim().toLowerCase();
  return esIdiomaSoportado(normalizado) ? normalizado : null;
}

interface PreferenciaIdioma {
  idioma: string;
  calidad: number;
}

/** `"en-GB;q=0.8"` → `{ idioma: 'en', calidad: 0.8 }`. Nunca lanza. */
function parsearPreferencia(entrada: string): PreferenciaIdioma | null {
  const [subtipoCompleto, ...parametros] = entrada.split(';').map((p) => p.trim());
  const subtipoPrimario = (subtipoCompleto ?? '').split('-')[0].toLowerCase();
  if (!subtipoPrimario) return null;

  const paramCalidad = parametros.find((p) => p.startsWith('q='));
  const calidad = paramCalidad ? Number.parseFloat(paramCalidad.slice(2)) : 1;

  return { idioma: subtipoPrimario, calidad: Number.isFinite(calidad) ? calidad : 0 };
}

function idiomaDeAcceptLanguage(cabecera: string | null | undefined): Language | null {
  if (!cabecera) return null;

  const preferencias = cabecera
    .split(',')
    .map((parte) => parsearPreferencia(parte.trim()))
    .filter((p): p is PreferenciaIdioma => p !== null)
    .sort((a, b) => b.calidad - a.calidad);

  for (const preferencia of preferencias) {
    const valido = idiomaValido(preferencia.idioma);
    if (valido) return valido;
  }
  return null;
}

/**
 * @public — cargador de la página pública (`cargar-perfil-publico.ts`) y de
 * la de gestión le pasan `searchParams.lang` y `headers().get('accept-language')`
 * tal cual. `lang` (query `?lang=`) gana siempre que sea uno de los 5
 * idiomas soportados; si no, se resuelve por `accept-language` ordenado
 * por `q`. Si nada cuadra, el idioma por defecto es `'es'`.
 */
export function idiomaDePeticion(lang?: string | null, acceptLanguage?: string | null): Language {
  return idiomaValido(lang) ?? idiomaDeAcceptLanguage(acceptLanguage) ?? 'es';
}
