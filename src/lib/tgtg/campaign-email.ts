/**
 * Piezas puras del email de campaña TooGoodToGo.
 *
 * Viven fuera de la ruta a propósito. Todo esto es decisión de contenido —qué
 * dominio se usa en los enlaces, qué asunto lleva el correo, qué texto plano
 * acompaña al HTML— y mezclarlo con la autenticación y el envío hacía de la
 * ruta una función de complejidad 50 que no se podía probar sin levantar medio
 * sistema. Aquí se prueba con una llamada.
 */

/** Campaña ya resuelta, con los enlaces de reserva generados. */
export interface CampanaParaEmail {
  promoId: string;
  horaInicio: string;
  horaFin: string;
  fechaActivacion: string;
  items: Array<{ titulo: string; precioDescuento: number | string; cuponesDisponibles: number; reservaUrl?: string }>;
}

/**
 * Hostname válido: etiquetas alfanuméricas, al menos un punto, y un TLD de dos
 * letras o más.
 *
 * NO es cosmético. El dominio acaba dentro de un `href` del correo, así que un
 * valor manipulado podría inyectar contenido en el HTML que se envía a los
 * clientes. Si no supera esta comprobación se usa el origen de la petición, que
 * es de confianza.
 */
const HOSTNAME_VALIDO = /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;

export function resolverBaseUrl(dominio: string | null | undefined, origenPeticion: string): string {
  return dominio && HOSTNAME_VALIDO.test(dominio) ? `https://${dominio}` : origenPeticion;
}

/** Asunto por idioma. Una campaña anuncia su horario; varias, cuántas hay. */
const ASUNTOS: Record<string, { una: (i: string, f: string) => string; varias: (n: number) => string }> = {
  es: { una: (i, f) => `¡Ofertas TooGoodToGo! Recogida ${i}–${f}`, varias: n => `¡${n} campañas TooGoodToGo disponibles hoy!` },
  en: { una: (i, f) => `TooGoodToGo offers! Pickup ${i}–${f}`,      varias: n => `¡${n} TooGoodToGo campaigns available today!` },
  fr: { una: (i, f) => `Offres TooGoodToGo! Retrait ${i}–${f}`,     varias: n => `¡${n} campagnes TooGoodToGo disponibles aujourd'hui!` },
  it: { una: (i, f) => `Offerte TooGoodToGo! Ritiro ${i}–${f}`,     varias: n => `¡${n} campagne TooGoodToGo disponibili oggi!` },
  de: { una: (i, f) => `TooGoodToGo Angebote! Abholung ${i}–${f}`,  varias: n => `¡${n} TooGoodToGo-Kampagnen heute verfügbar!` },
};

export function construirAsunto(lang: string, campanas: CampanaParaEmail[]): string {
  const textos = ASUNTOS[lang] ?? ASUNTOS.es;
  const primera = campanas[0];
  return campanas.length === 1 ? textos.una(primera.horaInicio, primera.horaFin) : textos.varias(campanas.length);
}

interface TextosPlano {
  title: string;
  pickupTime: string;
  disponible: string;
}

/**
 * Alternativa en texto plano del correo.
 *
 * No es un adorno: los clientes que bloquean HTML solo ven esto, y sin los
 * enlaces de reserva el correo no sirve de nada para ellos.
 */
export function construirTextoPlano(opts: {
  empresaNombre: string;
  campanas: CampanaParaEmail[];
  textos: TextosPlano;
  locale: string;
  urlBaja: string;
}): string {
  const lineas: string[] = [`${opts.empresaNombre} — ${opts.textos.title}`, ''];

  for (const campana of opts.campanas) {
    const fecha = new Date(`${campana.fechaActivacion}T00:00:00`)
      .toLocaleDateString(opts.locale, { weekday: 'long', day: '2-digit', month: 'long' });
    lineas.push(`${fecha} | ${opts.textos.pickupTime}: ${campana.horaInicio}–${campana.horaFin}`);

    for (const item of campana.items) {
      lineas.push(`  - ${item.titulo}: €${Number(item.precioDescuento).toFixed(2)} (${item.cuponesDisponibles} ${opts.textos.disponible})`);
      lineas.push(`    ${item.reservaUrl}`);
    }
    lineas.push('');
  }

  lineas.push(opts.urlBaja);
  return lineas.join('\n');
}

/**
 * Enlace de reserva de un ítem concreto para un destinatario concreto.
 *
 * Cada parámetro va codificado: el email y el token viajan en la query, y sin
 * codificar un `&` en cualquiera de ellos partiría la URL y el enlace llevaría
 * a una reserva distinta o a ninguna.
 */
export function construirUrlReserva(opts: {
  baseUrl: string;
  itemId: string;
  promoId: string;
  email: string;
  token: string;
  lang: string;
}): string {
  const q = new URLSearchParams({
    tgtg: 'confirm',
    itemId: opts.itemId,
    promoId: opts.promoId,
    email: opts.email,
    token: opts.token,
    lang: opts.lang,
  });
  return `${opts.baseUrl}/?${q.toString()}`;
}

/** Enlace de baja del boletín, para el pie del texto plano. */
export function construirUrlBaja(baseUrl: string, email: string, empresaId: string): string {
  const q = new URLSearchParams({ email, empresa: empresaId, action: 'baja' });
  return `${baseUrl}/api/unsubscribe?${q.toString()}`;
}
