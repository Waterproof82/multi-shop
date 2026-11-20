// src/app/m/[codigo]/not-found.tsx
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// Fase 9, R-QR.3.2/R-QR.3.3/DD4: mensaje neutro ÚNICO para las CINCO ramas
// que colapsan en 'no-encontrado' (desconocido, libre, pendiente, flag
// apagado, límite superado) — no dice CUÁL ocurrió. Incluye una guía para
// quien encuentra al animal y el enlace «¿Es tu chapa? Actívala»
// (`<EnlaceActivar/>`, construido del lado del cliente — DD4).
//
// El idioma se resuelve por `accept-language` (sin `?lang=`: Next no pasa
// `searchParams` a `not-found.tsx`) — así el cuerpo sigue siendo una
// función pura de la cabecera de la petición, nunca del estado real de la
// chapa (sin oráculo, R-QR.3.2) ni de qué código se pidió.
import { headers } from 'next/headers';
import { idiomaDePeticion } from '@/lib/pet-id/idioma';
import { t } from '@/lib/translations';
import { EnlaceActivar } from '@/components/mascota-publica/enlace-activar';

export default async function NotFound() {
  const headersList = await headers();
  const idioma = idiomaDePeticion(null, headersList.get('accept-language'));

  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">{t('mascotaNeutroTitulo', idioma)}</h1>
      <p className="max-w-md text-foreground/70">{t('mascotaNeutroTexto', idioma)}</p>
      <section className="max-w-md rounded-md border border-border bg-muted/30 p-4 text-left">
        <h2 className="text-sm font-semibold text-foreground">{t('mascotaNeutroGuiaTitulo', idioma)}</h2>
        <p className="mt-1 text-sm text-foreground/70">{t('mascotaNeutroGuiaTexto', idioma)}</p>
      </section>
      <EnlaceActivar idioma={idioma} />
    </main>
  );
}
