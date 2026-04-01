import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/brevo-email';
import { deleteImageFromR2 } from '@/core/infrastructure/storage/s3-client';
import { promocionUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, errorResponse, handleResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { escapeHtml } from '@/lib/html-utils';
import { generateUnsubscribeToken } from '@/lib/unsubscribe-token';

const createPromocionSchema = z.object({
  texto_promocion: z.string().min(1, 'El texto de promoción es requerido').max(1000),
  imagen_url: z.string().url().refine(
    (url) => url.startsWith('https://'),
    { message: 'imagen_url must use HTTPS' }
  ).optional().nullable(),
  fecha_fin: z.string().datetime({ offset: true }),
});

function buildEmailHtml(params: {
  empresaLogoUrl: string;
  empresaNombre: string;
  textoEscapado: string;
  imagen_url: string | undefined;
  fecha_fin: string | null | undefined;
  baseUrl: string;
  empresaId: string;
  recipientEmail: string;
}): string {
  const { empresaLogoUrl, empresaNombre, textoEscapado, imagen_url, fecha_fin, baseUrl, empresaId, recipientEmail } = params;

  const fechaFinFormatted = fecha_fin
    ? new Date(fecha_fin).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const encodedEmail = encodeURIComponent(recipientEmail);
  const tokenBaja = generateUnsubscribeToken(recipientEmail, empresaId, 'baja');
  const tokenAlta = generateUnsubscribeToken(recipientEmail, empresaId, 'alta');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 540px; margin: 24px auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.10);">
    <!-- Header con gradiente -->
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 30px 24px 26px; text-align: center;">
      ${empresaLogoUrl ? `<div style="margin-bottom: 16px;"><img src="${escapeHtml(empresaLogoUrl)}" alt="${escapeHtml(empresaNombre)}" style="max-width: 110px; max-height: 48px; object-fit: contain;"></div>` : ''}
      <div style="display: inline-block; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 20px; padding: 5px 16px; margin-bottom: 14px;">
        <span style="font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 1.5px; text-transform: uppercase;">Promocion</span>
      </div>
      <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 800; color: #fff; line-height: 1.2;">Nueva oferta especial</h1>
      <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 500;">No te pierdas nuestras mejores promociones</p>
    </div>

    <!-- Contenido -->
    <div style="padding: 24px 24px 20px;">
      <!-- Card de promocion -->
      <div style="border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; margin-bottom: 20px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        ${imagen_url ? `<img src="${escapeHtml(imagen_url)}" alt="Promocion" style="width: 100%; height: 200px; object-fit: cover; display: block;">` : ''}
        <div style="padding: 20px;">
          <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.7; font-weight: 500;">${textoEscapado}</p>
        </div>
      </div>

      <!-- Fecha de fin si existe -->
      ${fechaFinFormatted ? `
      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #fcd34d; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; text-align: center;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
          <span style="font-size: 20px;">⏰</span>
          <div>
            <p style="margin: 0; font-size: 12px; color: #92400e; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Oferta valida hasta</p>
            <p style="margin: 2px 0 0 0; font-size: 18px; color: #78350f; font-weight: 800;">${escapeHtml(fechaFinFormatted)}</p>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- CTA para ver menu -->
      <a href="${escapeHtml(baseUrl)}" style="display: block; width: 100%; box-sizing: border-box; text-align: center; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: #fff; font-size: 15px; font-weight: 700; padding: 14px 0; border-radius: 10px; text-decoration: none; letter-spacing: 0.2px; margin-bottom: 24px;">
        Ver nuestra web
      </a>

      <!-- Links de suscripcion -->
      <div style="border-top: 1px solid #f3f4f6; padding-top: 20px; padding-bottom: 8px; text-align: center;">
        <p style="margin: 0 0 10px; font-size: 13px; color: #6b7280;">
          <span style="margin-right: 6px;">❌</span>No quieres recibir mas ofertas? <a href="${baseUrl}/api/unsubscribe?email=${encodedEmail}&empresa=${empresaId}&action=baja&token=${tokenBaja}" style="color: #dc2626; text-decoration: underline;">Darse de baja</a>
        </p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          <span style="margin-right: 6px;">🔄</span>Cambiaste de opinion? <a href="${baseUrl}/api/unsubscribe?email=${encodedEmail}&empresa=${empresaId}&action=alta&token=${tokenAlta}" style="color: #7c3aed; text-decoration: underline;">Volver a suscribirse</a>
        </p>
      </div>
    </div>
  </div>
  <div style="height: 24px;"></div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const result = await promocionUseCase.getAll(empresaId!);
  if (!result.success) {
    return handleResult(result);
  }
  return NextResponse.json({ promociones: result.data });
}

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as any;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  try {
    const empresaResult = await empresaUseCase.getById(empresaId!);
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

    const createResult = await promocionUseCase.create(
      empresaId!,
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

        for (const email of emailTargets) {
          try {
            const personalizedHtml = buildEmailHtml({
              empresaLogoUrl,
              empresaNombre: empresa.nombre || 'Empresa',
              textoEscapado: escapeHtml(texto_promocion),
              imagen_url: imagen_url ?? undefined,
              fecha_fin: fecha_fin ?? null,
              baseUrl,
              empresaId: empresaId!,
              recipientEmail: email,
            });
            await sendEmail({
              to: [email],
              subject: 'Nueva promocion disponible',
              htmlContent: personalizedHtml,
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
