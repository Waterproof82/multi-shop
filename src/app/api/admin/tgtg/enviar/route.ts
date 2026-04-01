import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/brevo-email';
import { tgtgUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { escapeHtml } from '@/lib/html-utils';
import { generateUnsubscribeToken } from '@/lib/unsubscribe-token';
import { generateReservaToken } from '@/lib/reserva-token';
import type { TgtgItem } from '@/core/domain/entities/types';

const enviarSchema = z.object({
  promoIds: z.array(z.string().uuid()).min(1).max(10),
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
          <span style="color:#dc2626;">❌</span> ${texts.unsubscribeQuestion} <a href="${baseUrl}/api/unsubscribe?email=${encodedEmail}&empresa=${empresaId}&action=baja&token=${tokenBaja}" style="color:#dc2626;text-decoration:underline;">${texts.unsubscribeLink}</a>
        </p>
        <p style="margin:0;font-size:13px;color:#6b7280;">
          <span style="color:#16a34a;">🔄</span> ${texts.resubscribeQuestion} <a href="${baseUrl}/api/unsubscribe?email=${encodedEmail}&empresa=${empresaId}&action=alta&token=${tokenAlta}" style="color:#16a34a;text-decoration:underline;">${texts.resubscribeLink}</a>
        </p>
      </div>
    </div>
  </div>
  <div style="height:24px;"></div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as { empresaId: string | null; error: NextResponse | null; isSuperAdmin: boolean };
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = enviarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { promoIds } = parsed.data;

  // Fail fast — without this secret token generation will throw for every recipient
  if (!process.env.RESERVA_HMAC_SECRET) {
    return NextResponse.json({ error: 'RESERVA_HMAC_SECRET no está configurado en el servidor' }, { status: 500 });
  }

  try {
    const empresaResult = await empresaUseCase.getById(empresaId!);
    if (!empresaResult.success || !empresaResult.data) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }
    const empresa = empresaResult.data;

    // Fetch all recent campaigns once and index by id
    const allRecentResult = await tgtgUseCase.getAllRecent(empresaId!);
    if (!allRecentResult.success) {
      return NextResponse.json({ error: 'Error al obtener campañas' }, { status: 500 });
    }
    const recentByPromoId = new Map(allRecentResult.data.map(d => [d.promo.id, d]));

    // Validate each requested promo
    let emailTargets: Array<{ email: string; nombre: string | null; idioma: string | null }> = [];
    const campaignsToSend: Array<{ promoId: string; horaInicio: string; horaFin: string; fechaActivacion: string; items: TgtgItem[] }> = [];

    for (const promoId of promoIds) {
      const sendResult = await tgtgUseCase.sendCampaignEmails(empresaId!, promoId);
      if (!sendResult.success) {
        const status = sendResult.error.code === 'NOT_FOUND' ? 404 : sendResult.error.code === 'ALREADY_SENT' ? 409 : 400;
        return NextResponse.json({ error: sendResult.error.message }, { status });
      }
      if (emailTargets.length === 0) {
        emailTargets = sendResult.data.emailTargets;
      }
      const found = recentByPromoId.get(promoId);
      campaignsToSend.push({
        promoId,
        horaInicio: sendResult.data.promo.horaRecogidaInicio.slice(0, 5),
        horaFin: sendResult.data.promo.horaRecogidaFin.slice(0, 5),
        fechaActivacion: sendResult.data.promo.fechaActivacion,
        items: found ? found.items : [],
      });
    }

    if (emailTargets.length === 0) {
      return NextResponse.json({ error: 'No hay clientes suscritos a promociones' }, { status: 400 });
    }

    const MAX_EMAIL_RECIPIENTS = 500;
    if (emailTargets.length > MAX_EMAIL_RECIPIENTS) {
      return NextResponse.json({ error: `Demasiados destinatarios (${emailTargets.length}). Límite: ${MAX_EMAIL_RECIPIENTS}` }, { status: 400 });
    }

    const senderEmail = empresa.emailNotification || process.env.BREVO_DEFAULT_SENDER_EMAIL;
    if (!senderEmail) {
      return NextResponse.json({ error: 'Email remitente no configurado' }, { status: 500 });
    }

    const requestOrigin = new URL(request.url).origin;
    const baseUrl = empresa.dominio ? `https://${empresa.dominio}` : requestOrigin;

    let emailsSent = 0;
    let emailError: string | null = null;

    for (const target of emailTargets) {
      try {
        const lang = target.idioma || 'es';
        const campaigns = campaignsToSend.map((c) => ({
          promoId: c.promoId,
          horaInicio: c.horaInicio,
          horaFin: c.horaFin,
          fechaActivacion: c.fechaActivacion,
          items: c.items.map((item) => {
            const token = generateReservaToken(target.email, item.id, c.promoId);
            return {
              ...item,
              reservaUrl: `${baseUrl}/?tgtg=confirm&itemId=${encodeURIComponent(item.id)}&promoId=${encodeURIComponent(c.promoId)}&email=${encodeURIComponent(target.email)}&token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang)}`,
            };
          }),
        }));

        const subjects: Record<string, { single: string; multiple: string }> = {
          es: { single: `¡Ofertas TooGoodToGo! Recogida ${campaigns[0].horaInicio}–${campaigns[0].horaFin}`, multiple: `¡${campaigns.length} campañas TooGoodToGo disponibles hoy!` },
          en: { single: `TooGoodToGo offers! Pickup ${campaigns[0].horaInicio}–${campaigns[0].horaFin}`, multiple: `¡${campaigns.length} TooGoodToGo campaigns available today!` },
          fr: { single: `Offres TooGoodToGo! Retrait ${campaigns[0].horaInicio}–${campaigns[0].horaFin}`, multiple: `¡${campaigns.length} campagnes TooGoodToGo disponibles aujourd'hui!` },
          it: { single: `Offerte TooGoodToGo! Ritiro ${campaigns[0].horaInicio}–${campaigns[0].horaFin}`, multiple: `¡${campaigns.length} campagne TooGoodToGo disponibili oggi!` },
          de: { single: `TooGoodToGo Angebote! Abholung ${campaigns[0].horaInicio}–${campaigns[0].horaFin}`, multiple: `¡${campaigns.length} TooGoodToGo-Kampagnen heute verfügbar!` },
        };
        const subjectText = subjects[lang] || subjects.es;
        const subject = campaigns.length === 1 ? subjectText.single : subjectText.multiple;

        const texts = TGTG_EMAIL_TEXTS[lang] || TGTG_EMAIL_TEXTS.es;
        const locale = getLocaleForLang(lang);
        const plainLines: string[] = [`${empresa.nombre || 'Empresa'} — ${texts.title}`, ''];
        for (const c of campaigns) {
          const dateLabel = new Date(c.fechaActivacion + 'T00:00:00').toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long' });
          plainLines.push(`${dateLabel} | ${texts.pickupTime}: ${c.horaInicio}–${c.horaFin}`);
          for (const item of c.items) {
            plainLines.push(`  - ${item.titulo}: €${Number(item.precioDescuento).toFixed(2)} (${item.cuponesDisponibles} ${texts.disponible})`);
            plainLines.push(`    ${item.reservaUrl}`);
          }
          plainLines.push('');
        }
        plainLines.push(`${baseUrl}/api/unsubscribe?email=${encodeURIComponent(target.email)}&empresa=${empresaId}&action=baja`);

        await sendEmail({
          to: [target.email],
          subject,
          htmlContent: buildTgtgEmailHtml({
            empresaLogoUrl: empresa.logoUrl || '',
            empresaNombre: empresa.nombre || 'Empresa',
            campaigns,
            baseUrl,
            empresaId: empresaId!,
            recipientEmail: target.email,
            lang,
          }),
          textContent: plainLines.join('\n'),
          senderName: empresa.nombre || 'Promociones',
          senderEmail,
        });
        emailsSent++;
      } catch (sendErr) {
        await logApiError('Send TGTG email failed', sendErr, 'POST');
        if (!emailError) {
          emailError = sendErr instanceof Error ? sendErr.message : 'Error al enviar email';
        }
      }
    }

    // Mark all promos as sent — only if at least one email was delivered
    const updatedPromos: Array<{ id: string; emailEnviado: boolean; numeroEnvios: number }> = [];
    if (emailsSent > 0) {
      for (const c of campaignsToSend) {
        const markResult = await tgtgUseCase.markEmailSent(empresaId!, c.promoId, emailsSent);
        if (markResult.success) {
          updatedPromos.push({ id: markResult.data.id, emailEnviado: markResult.data.emailEnviado, numeroEnvios: markResult.data.numeroEnvios });
        }
      }
    }

    if (emailError) {
      await logApiError('TGTG emails partial error', new Error(emailError), 'POST');
    }

    return NextResponse.json({ emailsSent, emailError, updatedPromos });
  } catch (error) {
    await logApiError('Send TGTG campaign emails', error, 'POST');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
