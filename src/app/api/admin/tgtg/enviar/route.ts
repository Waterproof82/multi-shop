import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/brevo-email';
import { getTgtgUseCase, getEmpresaUseCase } from '@/core/infrastructure/database';
import { resolveAdminContextWithEmpresa } from '@/core/infrastructure/api/helpers';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { escapeHtml } from '@/lib/html-utils';
import { generateUnsubscribeToken } from '@/lib/unsubscribe-token';
import { generateReservaToken } from '@/lib/reserva-token';
import type { TgtgItem } from '@/core/domain/entities/types';
import {
  construirAsunto,
  construirTextoPlano,
  construirUrlBaja,
  construirUrlReserva,
  resolverBaseUrl,
} from '@/lib/tgtg/campaign-email';

const enviarSchema = z.object({
  promoIds: z.array(z.uuid()).min(1).max(10),
});

// Textos del email por idioma
const TGTG_EMAIL_TEXTS: Record<string, {
  title: string;
  subtitle: string;
  disponible: string;
  pickupTime: string;
  reserveButton: string;
  unsubscribeQuestion: string;
  unsubscribeLink: string;
  resubscribeQuestion: string;
  resubscribeLink: string;
}> = {
  es: {
    title: "¡Ofertas de hoy!",
    subtitle: "Aprovecha antes de que se agoten 🌱",
    disponible: "disponibles",
    pickupTime: "Recogida",
    reserveButton: "🛍️ Reservar ahora",
    unsubscribeQuestion: "¿No quieres recibir más ofertas?",
    unsubscribeLink: "Darse de baja",
    resubscribeQuestion: "¿Cambiaste de opinión?",
    resubscribeLink: "Volver a suscribirse",
  },
  en: {
    title: "Today's deals!",
    subtitle: "Grab them before they're gone 🌱",
    disponible: "available",
    pickupTime: "Pickup",
    reserveButton: "🛍️ Reserve now",
    unsubscribeQuestion: "Don't want to receive more offers?",
    unsubscribeLink: "Unsubscribe",
    resubscribeQuestion: "Changed your mind?",
    resubscribeLink: "Subscribe again",
  },
  fr: {
    title: "Offres du jour!",
    subtitle: "Profitez-en avant qu'elles ne disparaissent 🌱",
    disponible: "disponibles",
    pickupTime: "Retrait",
    reserveButton: "🛍️ Réserver maintenant",
    unsubscribeQuestion: "Vous ne souhaitez plus recevoir d'offres?",
    unsubscribeLink: "Se désinscrire",
    resubscribeQuestion: "Vous avez changé d'avis?",
    resubscribeLink: "Se réinscrire",
  },
  it: {
    title: "Offerte di oggi!",
    subtitle: "Approfittane prima che finiscano 🌱",
    disponible: "disponibili",
    pickupTime: "Ritiro",
    reserveButton: "🛍️ Prenota ora",
    unsubscribeQuestion: "Non vuoi più ricevere offerte?",
    unsubscribeLink: "Annulla iscrizione",
    resubscribeQuestion: "Hai cambiato idea?",
    resubscribeLink: "Riiscriviti",
  },
  de: {
    title: "Angebote von heute!",
    subtitle: "Greifen Sie zu, bevor sie weg sind 🌱",
    disponible: "verfügbar",
    pickupTime: "Abholung",
    reserveButton: "🛍️ Jetzt reservieren",
    unsubscribeQuestion: "Keine weiteren Angebote mehr erhalten?",
    unsubscribeLink: "Abmelden",
    resubscribeQuestion: "Meinung geändert?",
    resubscribeLink: "Erneut anmelden",
  },
};

function getLocaleForLang(lang: string): string {
  const locales: Record<string, string> = {
    es: 'es-ES', en: 'en-GB', fr: 'fr-FR', it: 'it-IT', de: 'de-DE',
  };
  return locales[lang] || 'es-ES';
}

function buildTgtgEmailHtml(params: {
  empresaLogoUrl: string;
  empresaNombre: string;
  campaigns: Array<{
    promoId: string;
    horaInicio: string;
    horaFin: string;
    fechaActivacion: string;
    items: Array<TgtgItem & { reservaUrl: string }>;
  }>;
  baseUrl: string;
  empresaId: string;
  recipientEmail: string;
  lang?: string;
}): string {
  const { empresaLogoUrl, empresaNombre, campaigns, baseUrl, empresaId, recipientEmail, lang = 'es' } = params;
  // Escape baseUrl for safe injection into HTML href attributes
  const safeBaseUrl = escapeHtml(baseUrl);
  const texts = TGTG_EMAIL_TEXTS[lang] || TGTG_EMAIL_TEXTS.es;
  const locale = getLocaleForLang(lang);
  const encodedEmail = encodeURIComponent(recipientEmail);
  const tokenBaja = generateUnsubscribeToken(recipientEmail, empresaId, 'baja');
  const tokenAlta = generateUnsubscribeToken(recipientEmail, empresaId, 'alta');

  const campaignSections = campaigns.map((c) => {
    const dateObj = new Date(c.fechaActivacion + 'T00:00:00');
    const dateLabel = dateObj.toLocaleDateString(locale, {
      weekday: 'long', day: '2-digit', month: 'long',
    });

    const itemCards = c.items.map((item) => `
      <div style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin-bottom:14px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        ${item.imagenUrl ? `<img src="${escapeHtml(item.imagenUrl)}" alt="${escapeHtml(item.titulo)}" style="width:100%;height:175px;object-fit:cover;display:block;">` : ''}
        <div style="padding:16px;">
          <h3 style="margin:0 0 5px;font-size:17px;font-weight:700;color:#111827;">${escapeHtml(item.titulo)}</h3>
          ${item.descripcion ? `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.5;">${escapeHtml(item.descripcion)}</p>` : ''}
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <span style="font-size:14px;color:#9ca3af;text-decoration:line-through;">€${Number(item.precioOriginal).toFixed(2)}</span>
            <span style="font-size:24px;font-weight:800;color:#16a34a;">€${Number(item.precioDescuento).toFixed(2)}</span>
            <span style="margin-left:auto;font-size:12px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;padding:3px 10px;border-radius:20px;">${item.cuponesDisponibles} ${texts.disponible}</span>
          </div>
          <a href="${escapeHtml(item.reservaUrl)}" style="display:block;width:100%;box-sizing:border-box;text-align:center;background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);color:#fff;font-size:15px;font-weight:700;padding:13px 0;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">
            ${texts.reserveButton}
          </a>
        </div>
      </div>`).join('');

    return `
      <div style="margin-bottom:30px;">
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #f3f4f6;">
          <span style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:700;color:#15803d;text-transform:capitalize;">📅 ${escapeHtml(dateLabel)}</span>
          <span style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;color:#374151;">🕐 ${texts.pickupTime}: ${escapeHtml(c.horaInicio)} – ${escapeHtml(c.horaFin)}</span>
        </div>
        ${itemCards}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:540px;margin:24px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);padding:30px 24px 26px;text-align:center;">
      ${empresaLogoUrl ? `<div style="margin-bottom:16px;"><img src="${escapeHtml(empresaLogoUrl)}" alt="${escapeHtml(empresaNombre)}" style="max-width:110px;max-height:48px;object-fit:contain;"></div>` : ''}
      <div style="display:inline-block;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);border-radius:20px;padding:5px 16px;margin-bottom:14px;">
        <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:1.5px;text-transform:uppercase;">TooGoodToGo</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#fff;line-height:1.2;">${texts.title}</h1>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);font-weight:500;">${texts.subtitle}</p>
    </div>
    <div style="padding:24px 24px 20px;">
      ${campaignSections}
      <div style="border-top:1px solid #f3f4f6;padding-top:20px;padding-bottom:8px;text-align:center;">
        <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">
          <span style="color:#dc2626;">❌</span> ${texts.unsubscribeQuestion} <a href="${safeBaseUrl}/api/unsubscribe?email=${encodedEmail}&empresa=${empresaId}&action=baja&token=${tokenBaja}" style="color:#dc2626;text-decoration:underline;">${texts.unsubscribeLink}</a>
        </p>
        <p style="margin:0;font-size:13px;color:#6b7280;">
          <span style="color:#16a34a;">🔄</span> ${texts.resubscribeQuestion} <a href="${safeBaseUrl}/api/unsubscribe?email=${encodedEmail}&empresa=${empresaId}&action=alta&token=${tokenAlta}" style="color:#16a34a;text-decoration:underline;">${texts.resubscribeLink}</a>
        </p>
      </div>
    </div>
  </div>
  <div style="height:24px;"></div>
</body>
</html>`;
}

/** Destinatario del boletín de promociones. */
type Destinatario = { email: string; nombre: string | null; idioma: string | null };

/** Campaña validada y lista para componer, antes de personalizar por destinatario. */
type CampanaBase = {
  promoId: string;
  horaInicio: string;
  horaFin: string;
  fechaActivacion: string;
  items: TgtgItem[];
};

/**
 * Resultado de un paso que puede cortar la petición.
 *
 * Las rutas devuelven `NextResponse`, así que un helper que valide algo tiene
 * que poder decir "toma la respuesta ya hecha" o "toma el dato". Sin esto, cada
 * comprobación tendría que quedarse dentro del handler y volveríamos al mismo
 * bloque de 170 líneas.
 */
type PasoRuta<T> = { corte: NextResponse } | { valor: T };

/** Tope de destinatarios por envío. Brevo cobra por correo y esto es un botón. */
const MAX_DESTINATARIOS = 500;

async function leerPromoIds(request: NextRequest): Promise<PasoRuta<string[]>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { corte: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
  }

  const parsed = enviarSchema.safeParse(body);
  if (!parsed.success) {
    return { corte: NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 }) };
  }
  return { valor: parsed.data.promoIds };
}

/**
 * Valida cada campaña pedida y reúne los destinatarios.
 *
 * `sendCampaignEmails` es quien decide si una campaña puede enviarse; aquí solo
 * se traduce su negativa al status HTTP que corresponde. Basta que una falle
 * para abortar el lote entero: enviar la mitad dejaría al admin sin saber cuáles
 * salieron.
 */
async function prepararCampanas(
  empresaId: string,
  promoIds: string[],
): Promise<PasoRuta<{ destinatarios: Destinatario[]; campanas: CampanaBase[] }>> {
  const recientes = await getTgtgUseCase().getAllRecent(empresaId);
  if (!recientes.success) {
    return { corte: NextResponse.json({ error: 'Error al obtener campañas' }, { status: 500 }) };
  }
  const itemsPorPromo = new Map(recientes.data.map(d => [d.promo.id, d.items]));

  let destinatarios: Destinatario[] = [];
  const campanas: CampanaBase[] = [];

  for (const promoId of promoIds) {
    const envio = await getTgtgUseCase().sendCampaignEmails(empresaId, promoId);
    if (!envio.success) {
      return { corte: NextResponse.json({ error: envio.error.message }, { status: statusDeError(envio.error.code) }) };
    }

    // La lista de suscritos es la misma para todas las campañas de la empresa.
    if (destinatarios.length === 0) destinatarios = envio.data.emailTargets;

    campanas.push({
      promoId,
      horaInicio: envio.data.promo.horaRecogidaInicio.slice(0, 5),
      horaFin: envio.data.promo.horaRecogidaFin.slice(0, 5),
      fechaActivacion: envio.data.promo.fechaActivacion,
      items: itemsPorPromo.get(promoId) ?? [],
    });
  }

  return { valor: { destinatarios, campanas } };
}

function statusDeError(code: string): number {
  if (code === 'NOT_FOUND') return 404;
  if (code === 'ALREADY_SENT') return 409;
  return 400;
}

function validarDestinatarios(destinatarios: Destinatario[]): NextResponse | null {
  if (destinatarios.length === 0) {
    return NextResponse.json({ error: 'No hay clientes suscritos a promociones' }, { status: 400 });
  }
  if (destinatarios.length > MAX_DESTINATARIOS) {
    return NextResponse.json(
      { error: `Demasiados destinatarios (${destinatarios.length}). Límite: ${MAX_DESTINATARIOS}` },
      { status: 400 },
    );
  }
  return null;
}

/** Campañas con el enlace de reserva ya personalizado para este destinatario. */
function personalizarCampanas(
  campanas: CampanaBase[],
  baseUrl: string,
  email: string,
  lang: string,
): Array<CampanaBase & { items: Array<TgtgItem & { reservaUrl: string }> }> {
  return campanas.map(campana => ({
    ...campana,
    items: campana.items.map(item => ({
      ...item,
      reservaUrl: construirUrlReserva({
        baseUrl,
        itemId: item.id,
        promoId: campana.promoId,
        email,
        token: generateReservaToken(email, item.id, campana.promoId),
        lang,
      }),
    })),
  }));
}

interface ContextoEnvio {
  empresaId: string;
  empresaNombre: string;
  empresaLogoUrl: string;
  senderEmail: string;
  baseUrl: string;
  campanas: CampanaBase[];
}

/**
 * Envía el correo a cada destinatario.
 *
 * Un fallo NO interrumpe el bucle: si el servidor de correo rechaza una
 * dirección concreta, el resto del boletín debe salir igual. Se guarda el
 * primer error para devolverlo como aviso junto al recuento de enviados.
 */
async function enviarACadaDestinatario(
  destinatarios: Destinatario[],
  ctx: ContextoEnvio,
): Promise<{ emailsSent: number; emailError: string | null }> {
  let emailsSent = 0;
  let emailError: string | null = null;

  for (const destinatario of destinatarios) {
    try {
      const lang = destinatario.idioma || 'es';
      const campanas = personalizarCampanas(ctx.campanas, ctx.baseUrl, destinatario.email, lang);
      const textos = TGTG_EMAIL_TEXTS[lang] || TGTG_EMAIL_TEXTS.es;

      await sendEmail({
        to: [destinatario.email],
        subject: construirAsunto(lang, campanas),
        htmlContent: buildTgtgEmailHtml({
          empresaLogoUrl: ctx.empresaLogoUrl,
          empresaNombre: ctx.empresaNombre,
          campaigns: campanas,
          baseUrl: ctx.baseUrl,
          empresaId: ctx.empresaId,
          recipientEmail: destinatario.email,
          lang,
        }),
        textContent: construirTextoPlano({
          empresaNombre: ctx.empresaNombre,
          campanas,
          textos,
          locale: getLocaleForLang(lang),
          urlBaja: construirUrlBaja(ctx.baseUrl, destinatario.email, ctx.empresaId),
        }),
        senderName: ctx.empresaNombre,
        senderEmail: ctx.senderEmail,
      });
      emailsSent++;
    } catch (sendErr) {
      await logApiError('Send TGTG email failed', sendErr, 'POST');
      emailError ??= sendErr instanceof Error ? sendErr.message : 'Error al enviar email';
    }
  }

  return { emailsSent, emailError };
}

/**
 * Marca las campañas como enviadas.
 *
 * Solo si salió al menos un correo: marcarlas tras un fallo total dejaría al
 * admin sin poder reintentar, porque `sendCampaignEmails` rechaza las ya
 * enviadas con ALREADY_SENT.
 */
async function marcarComoEnviadas(
  empresaId: string,
  campanas: CampanaBase[],
  emailsSent: number,
): Promise<Array<{ id: string; emailEnviado: boolean; numeroEnvios: number }>> {
  if (emailsSent === 0) return [];

  const actualizadas: Array<{ id: string; emailEnviado: boolean; numeroEnvios: number }> = [];
  for (const campana of campanas) {
    const marcada = await getTgtgUseCase().markEmailSent(empresaId, campana.promoId, emailsSent);
    if (marcada.success) {
      actualizadas.push({
        id: marcada.data.id,
        emailEnviado: marcada.data.emailEnviado,
        numeroEnvios: marcada.data.numeroEnvios,
      });
    }
  }
  return actualizadas;
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const promoIds = await leerPromoIds(request);
  if ('corte' in promoIds) return promoIds.corte;

  // Falla pronto: sin este secreto, generar el token reventaría en CADA
  // destinatario, después de haber marcado campañas y consumido cuota de envío.
  if (!process.env.RESERVA_HMAC_SECRET) {
    return NextResponse.json({ error: 'RESERVA_HMAC_SECRET no está configurado en el servidor' }, { status: 500 });
  }

  try {
    const empresaResult = await getEmpresaUseCase().getById(empresaId);
    if (!empresaResult.success || !empresaResult.data) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }
    const empresa = empresaResult.data;

    const preparacion = await prepararCampanas(empresaId, promoIds.valor);
    if ('corte' in preparacion) return preparacion.corte;
    const { destinatarios, campanas } = preparacion.valor;

    const rechazo = validarDestinatarios(destinatarios);
    if (rechazo) return rechazo;

    const senderEmail = empresa.emailNotification || process.env.BREVO_DEFAULT_SENDER_EMAIL;
    if (!senderEmail) {
      return NextResponse.json({ error: 'Email remitente no configurado' }, { status: 500 });
    }

    const { emailsSent, emailError } = await enviarACadaDestinatario(destinatarios, {
      empresaId,
      empresaNombre: empresa.nombre || 'Empresa',
      empresaLogoUrl: empresa.logoUrl || '',
      senderEmail,
      baseUrl: resolverBaseUrl(empresa.dominio, new URL(request.url).origin),
      campanas,
    });

    const updatedPromos = await marcarComoEnviadas(empresaId, campanas, emailsSent);

    if (emailError) {
      await logApiError('TGTG emails partial error', new Error(emailError), 'POST');
    }

    return NextResponse.json({ emailsSent, emailError, updatedPromos });
  } catch (error) {
    await logApiError('Send TGTG campaign emails', error, 'POST');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
