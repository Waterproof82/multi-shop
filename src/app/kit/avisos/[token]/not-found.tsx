// src/app/kit/avisos/[token]/not-found.tsx
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// R-M2b.3.2: mensaje neutro ÚNICO — un token con forma incorrecta,
// desconocido en esta empresa o de un alta pendiente ya caducada dan
// exactamente el mismo 404. Ofrece volver a pedir los avisos desde el QR.
import { URL_LISTA_MOCHILA } from '@/lib/kit-caducidad/etiqueta-urls';

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">Este enlace ya no es válido</h1>
      <p className="max-w-md text-foreground/70">
        Puedes volver a pedir los avisos escaneando el QR de tu kit.
      </p>
      <a
        href={URL_LISTA_MOCHILA}
        className="min-h-11 inline-flex items-center justify-center rounded-md bg-primary px-4 text-primary-foreground"
      >
        Revisa la lista de tu mochila
      </a>
    </main>
  );
}
