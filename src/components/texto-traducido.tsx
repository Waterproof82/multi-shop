'use client';

import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

/**
 * Un texto traducido para usar DENTRO de un server component: el idioma vive
 * en el navegador (localStorage / ?lang=), así que el servidor no puede
 * resolverlo. La clave es un string plano y cruza la frontera sin problema.
 */
export function TextoTraducido({ k }: Readonly<{ k: Parameters<typeof t>[0] }>) {
  const { language } = useLanguage();
  return <>{t(k, language)}</>;
}
