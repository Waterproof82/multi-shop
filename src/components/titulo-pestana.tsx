'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

/**
 * Sincroniza el <title> con el idioma del selector. El servidor lo genera
 * solo con `?lang=` (ver buildTenantPageMetadata); el idioma elegido vive en
 * localStorage y no le llega. Mismo formato que el servidor: `Título | Nombre`.
 *
 * Sin efecto en SEO: un rastreador no tiene localStorage, así que su idioma
 * sale de `?lang=` y el título coincide con el del HTML.
 */
export function TituloPestana({ k, nombre }: Readonly<{ k: Parameters<typeof t>[0]; nombre: string }>) {
  const { language } = useLanguage();

  useEffect(() => {
    document.title = `${t(k, language)} | ${nombre}`;
  }, [k, nombre, language]);

  return null;
}
