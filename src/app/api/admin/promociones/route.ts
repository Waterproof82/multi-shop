import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/brevo-email';
import { deleteImageFromR2 } from '@/core/infrastructure/storage/s3-client';
import { getPromocionUseCase, getEmpresaUseCase } from '@/core/infrastructure/database';
import { resolveAdminContextWithEmpresa, errorResponse, handleResult } from '@/core/infrastructure/api/helpers';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { buildEmailHtml, PROMO_EMAIL_TEXTS, getLocaleForLang } from '@/core/infrastructure/services/promo-email.builder';
import { escapeHtml } from '@/lib/html-utils';

const createPromocionSchema = z.object({
  texto_promocion: z.string().min(1, 'El texto de promoción es requerido').max(1000),
  imagen_url: z.string().url().refine(
    (url) => url.startsWith('https://'),
    { message: 'imagen_url must use HTTPS' }
  ).optional().nullable(),
  fecha_fin: z.string().datetime({ offset: true }),
});

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getPromocionUseCase().getAll(empresaId);
  if (!result.success) {
    return handleResult(result);
  }
  return NextResponse.json({ promociones: result.data });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  try {
    const empresaResult = await getEmpresaUseCase().getById(empresaId);
    if (!empresaResult.success) {
      return NextResponse.json({ error: empresaResult.error.message }, { status: 500 });
    }
    const empresa = empresaResult.data;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const parsed = createPromocionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { texto_promocion, imagen_url, fecha_fin } = parsed.data;

    const createResult = await getPromocionUseCase().create(
      empresaId,
      texto_promocion,
      imagen_url,
      fecha_fin!,
    );

    if (!createResult.success) {
      return NextResponse.json({ error: createResult.error.message }, { status: 500 });
    }

    const { promo, oldImageUrl, emailTargets } = createResult.data;

    if (oldImageUrl) {
      await deleteImageFromR2(oldImageUrl);
    }

    let emailsSent = 0;
    let emailError: string | null = null;

    const MAX_EMAIL_RECIPIENTS = 500;
    if (!empresa) {
      emailError = 'Empresa no encontrada';
    } else if (emailTargets.length === 0) {
      emailError = 'Sin clientes suscritos';
    } else if (emailTargets.length > MAX_EMAIL_RECIPIENTS) {
      emailError = `Demasiados destinatarios (${emailTargets.length}). Límite: ${MAX_EMAIL_RECIPIENTS}`;
    } else {
      const senderEmail = empresa.emailNotification || process.env.BREVO_DEFAULT_SENDER_EMAIL;
      if (!senderEmail) {
        emailError = 'Email remitente no configurado (emailNotification o BREVO_DEFAULT_SENDER_EMAIL)';
      } else {
        const empresaLogoUrl = empresa.logoUrl || '';
        const requestOrigin = new URL(request.url).origin;
        const baseUrl = empresa.dominio ? `https://${empresa.dominio}` : requestOrigin;

        // Subjects por idioma
        const subjects: Record<string, string> = {
          es: 'Nueva promocion disponible',
          en: 'New promotion available',
          fr: 'Nouvelle promotion disponible',
          it: 'Nuova promozione disponibile',
          de: 'Neues Angebot verfugbar',
        };

        for (const target of emailTargets) {
          try {
            const lang = target.idioma || 'es';
            const personalizedHtml = buildEmailHtml({
              empresaLogoUrl,
              empresaNombre: empresa.nombre || 'Empresa',
              textoEscapado: escapeHtml(texto_promocion),
              imagen_url: imagen_url ?? undefined,
              fecha_fin: fecha_fin ?? null,
              baseUrl,
              empresaId: empresaId,
              recipientEmail: target.email,
              primaryColor: empresa.colores?.primary || '#7c3aed',
              primaryForeground: empresa.colores?.primaryForeground || '#FFFFFF',
              lang,
            });
            const texts = PROMO_EMAIL_TEXTS[lang] || PROMO_EMAIL_TEXTS.es;
            const locale = getLocaleForLang(lang);
            const fechaFinPlain = fecha_fin
              ? new Date(fecha_fin).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
              : null;
            const plainLines = [
              `${empresa.nombre || 'Empresa'} — ${texts.title}`,
              '',
              texto_promocion,
              ...(fechaFinPlain ? ['', `${texts.validUntil}: ${fechaFinPlain}`] : []),
              '',
              `${texts.viewWebsite}: ${baseUrl}`,
              '',
              `${texts.unsubscribeLink}: ${baseUrl}/api/unsubscribe?email=${encodeURIComponent(target.email)}&empresa=${empresaId}&action=baja`,
            ];
            await sendEmail({
              to: [target.email],
              subject: subjects[lang] || subjects.es,
              htmlContent: personalizedHtml,
              textContent: plainLines.join('\n'),
              senderName: empresa.nombre || 'Promociones',
              senderEmail,
            });
            emailsSent++;
          } catch (sendErr) {
            await logApiError('Send promo email failed', sendErr, 'POST');
            if (!emailError) {
              emailError = sendErr instanceof Error ? sendErr.message : 'Error al enviar email';
            }
          }
        }
      }
    }

    if (emailError) {
      await logApiError('Promo emails skipped', new Error(emailError), 'POST');
    }

    return NextResponse.json({ promocion: promo, emailsSent, emailError });
  } catch (error) {
    await logApiError('Create promocion', error, 'POST');
    return errorResponse('Error interno');
  }
}
