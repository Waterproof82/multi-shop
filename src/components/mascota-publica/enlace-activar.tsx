// src/components/mascota-publica/enlace-activar.tsx
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// Fase 9, DD4 de design.md: el código YA está en la URL (`/m/{codigo}`),
// así que `usePathname()` lo lee del lado del cliente en vez de recibirlo
// como prop del cargador — así `not-found.tsx` sigue sin ningún argumento
// ligado al estado real de la chapa, y su HTML de servidor no cambia según
// cuál de los casos de R-QR.3.2 ocurrió (sin oráculo).
'use client';

import { usePathname } from 'next/navigation';
import type { Language } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface Props {
  idioma: Language;
}

const PREFIJO_RUTA = '/m/';

export function EnlaceActivar({ idioma }: Readonly<Props>) {
  const pathname = usePathname();
  const codigo = pathname?.startsWith(PREFIJO_RUTA) ? pathname.slice(PREFIJO_RUTA.length) : '';

  return (
    <a
      href={`/m/activar?c=${encodeURIComponent(codigo)}`}
      className="min-h-11 inline-flex items-center justify-center rounded-md bg-primary px-4 text-primary-foreground"
    >
      {t('mascotaNeutroActivarEnlace', idioma)}
    </a>
  );
}
