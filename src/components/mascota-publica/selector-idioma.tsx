// src/components/mascota-publica/selector-idioma.tsx
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// Fase 9, DD9 de design.md: "al pie hay 5 enlaces `?lang=`" — un componente
// de SERVIDOR, nunca un selector de cliente (sin parpadeo con el SSR, a
// diferencia de `useLanguage()`).
import type { Language } from '@/lib/language-context';
import { languages, t } from '@/lib/translations';

interface Props {
  idioma: Language;
}

const NOMBRE_IDIOMA: Record<Language, string> = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
};

export function SelectorIdioma({ idioma }: Readonly<Props>) {
  return (
    <nav aria-label={t('mascotaPerfilIdiomaAriaLabel', idioma)} className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
      {languages.map((codigo) => (
        <a
          key={codigo}
          href={`?lang=${codigo}`}
          aria-current={codigo === idioma ? 'true' : undefined}
          className={codigo === idioma ? 'font-semibold text-foreground' : 'text-foreground/60 underline-offset-2 hover:underline'}
        >
          {NOMBRE_IDIOMA[codigo]}
        </a>
      ))}
    </nav>
  );
}
