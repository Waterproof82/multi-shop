// src/app/kit/[serie]/not-found.tsx
// kit-expiry-m2a (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2a/)
// R-M2a.1.4: mensaje neutro ÚNICO para los cinco casos de R-M2a.1.3 (sin
// tenant, módulo apagado, límite superado, serie inválida, serie
// desconocida en esta empresa). No dice CUÁL ocurrió — invita a comprobar
// la serie de la etiqueta o a reintentarlo en un minuto, y enlaza a la
// lista de la mochila (nunca deja al cliente sin salida).
import { URL_LISTA_MOCHILA } from '@/lib/kit-caducidad/etiqueta-urls';

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">No hemos podido mostrar este kit</h1>
      <p className="max-w-md text-foreground/70">
        Comprueba que la serie de la etiqueta está bien escrita, o inténtalo de nuevo en un minuto.
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
