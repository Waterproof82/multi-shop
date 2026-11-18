// src/lib/peticion-publica.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// DD6 de design.md: el CSRF de doble envío de `proxy.ts` solo cubre
// admin/waiter/kitchen (CLAUDE.md) y `proxy.ts` sigue congelado — no se
// toca. Esta es la protección mínima de las rutas POST PÚBLICAS nuevas
// (`/api/kit-avisos/{alta,gestion,enlace}`), con el mismo criterio que
// `/api/descuento/subscribe`: un formulario de otro origen no puede enviar
// `application/json` sin preflight, y el preflight lo corta el CORS; el
// `Origin` ajeno es la segunda barrera cuando SÍ llega la cabecera.
export type ResultadoPeticionPublica = { ok: true } | { ok: false; status: 415 | 403 };

function hostDe(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * `Content-Type` debe ser `application/json` (admite `; charset=...`); si
 * llega `Origin`, su host debe coincidir con el de la propia petición. Sin
 * `Origin` (la mayoría de clientes JSON same-origin no lo envían) se acepta.
 */
export function esPeticionJsonPublicaValida(request: Request): ResultadoPeticionPublica {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 415 };
  }

  const origin = request.headers.get('origin');
  if (origin) {
    const origenHost = hostDe(origin);
    const peticionHost = hostDe(request.url);
    if (!origenHost || origenHost !== peticionHost) {
      return { ok: false, status: 403 };
    }
  }

  return { ok: true };
}
