import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/brevo-email';
import { tgtgUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, errorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { escapeHtml } from '@/lib/html-utils';
import { generateUnsubscribeToken } from '@/lib/unsubscribe-token';
import { generateReservaToken } from '@/lib/reserva-token';
import { createTgtgSchema } from '@/core/application/dtos/tgtg.dto';
import type { TgtgItem } from '@/core/domain/entities/types';

function buildTgtgEmailHtml(params: {
  empresaLogoUrl: string;
  empresaNombre: string;
  horaInicio: string;
  horaFin: string;
  items: Array<TgtgItem & { reservaUrl: string }>;
  baseUrl: string;
  empresaId: string;
  recipientEmail: string;
}): string {
  const { empresaLogoUrl, empresaNombre, horaInicio, horaFin, items, baseUrl, empresaId, recipientEmail } = params;
  const encodedEmail = encodeURIComponent(recipientEmail);
  const tokenBaja = generateUnsubscribeToken(recipientEmail, empresaId, 'baja');
  const tokenAlta = generateUnsubscribeToken(recipientEmail, empresaId, 'alta');

  const itemCards = items
    .map((item) => `
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 16px;">
        ${item.imagenUrl ? `<img src="${escapeHtml(item.imagenUrl)}" alt="${escapeHtml(item.titulo)}" style="width: 100%; height: 180px; object-fit: cover; display: block;">` : ''}
        <div style="padding: 16px;">
          <h3 style="margin: 0 0 6px; font-size: 17px; font-weight: 700; color: #111827;">${escapeHtml(item.titulo)}</h3>
          ${item.descripcion ? `<p style="margin: 0 0 12px; font-size: 14px; color: #6b7280; line-height: 1.5;">${escapeHtml(item.descripcion)}</p>` : ''}
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
            <span style="font-size: 15px; color: #9ca3af; text-decoration: line-through;">€${Number(item.precioOriginal).toFixed(2)}</span>
            <span style="font-size: 20px; font-weight: 800; color: #16a34a;">€${Number(item.precioDescuento).toFixed(2)}</span>
            <span style="font-size: 12px; color: #6b7280; margin-left: auto;">${item.cuponesDisponibles} disponibles</span>
          </div>
          <a href="${item.reservaUrl}" style="display: block; width: 100%; text-align: center; background-color: #15803d; color: #ffffff; font-size: 15px; font-weight: 600; padding: 12px 0; border-radius: 8px; text-decoration: none;">
            Reservar ahora
          </a>
        </div>
      </div>
    `)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
    ${empresaLogoUrl ? `<div style="padding: 24px 24px 0; text-align: center;"><img src="${escapeHtml(empresaLogoUrl)}" alt="${escapeHtml(empresaNombre)}" style="max-width: 140px; max-height: 60px; object-fit: contain;"></div>` : ''}
    <div style="padding: 24px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #dcfce7; color: #15803d; font-size: 13px; font-weight: 600; padding: 6px 16px; border-radius: 20px; margin-bottom: 12px;">TooGoodToGo</div>
        <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #111827;">¡Ofertas de hoy!</h2>
        <div style="display: inline-flex; align-items: center; gap: 6px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 14px;">
          <span style="font-size: 16px;">🕐</span>
          <span style="font-size: 14px; font-weight: 600; color: #374151;">Recogida: ${escapeHtml(horaInicio)} – ${escapeHtml(horaFin)}</span>
        </div>
      </div>
      ${itemCards}
      <div style="border-top: 1px solid #f3f4f6; margin-top: 20px; padding-top: 16px; text-align: center;">
        <p style="margin: 0 0 6px; font-size: 12px; color: #9ca3af;">
          <a href="${baseUrl}/api/unsubscribe?email=${encodedEmail}&empresa=${empresaId}&action=baja&token=${tokenBaja}" style="color: #dc2626; text-decoration: underline;">Dar de baja las promociones</a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          <a href="${baseUrl}/api/unsubscribe?email=${encodedEmail}&empresa=${empresaId}&action=alta&token=${tokenAlta}" style="color: #16a34a; text-decoration: underline;">Volver a dar de alta</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as { empresaId: string | null; error: NextResponse | null; isSuperAdmin: boolean };
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const result = await tgtgUseCase.getWithItems(empresaId!);
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  if (!result.data) {
    return NextResponse.json({ tgtgPromo: null });
  }

  // Fetch reservas counts per item
  const reservasResult = await tgtgUseCase.getReservas(empresaId!, result.data.promo.id);
  const reservasByItem: Record<string, number> = {};
  if (reservasResult.success) {
    for (const r of reservasResult.data) {
      reservasByItem[r.itemId] = (reservasByItem[r.itemId] ?? 0) + 1;
    }
  }

  const itemsWithCounts = result.data.items.map((item) => ({
    ...item,
    reservasCount: reservasByItem[item.id] ?? 0,
  }));

  return NextResponse.json({
    tgtgPromo: {
      ...result.data.promo,
      items: itemsWithCounts,
    },
  });
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

    const parsed = createTgtgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { hora_recogida_inicio, hora_recogida_fin, items } = parsed.data;

    const createResult = await tgtgUseCase.create(
      empresaId!,
      hora_recogida_inicio,
      hora_recogida_fin,
      items.map((item, index) => ({
        titulo: item.titulo,
        descripcion: item.descripcion,
        imagenUrl: item.imagen_url,
        precioOriginal: item.precio_original,
        precioDescuento: item.precio_descuento,
        cuponesTotal: item.cupones_total,
        orden: index,
      })),
    );

    if (!createResult.success) {
      return NextResponse.json({ error: createResult.error.message }, { status: 500 });
    }

    const { promo, emailTargets } = createResult.data;

    // Fetch items with IDs for building email links
    const itemsResult = await tgtgUseCase.getWithItems(empresaId!);
    const createdItems = itemsResult.success && itemsResult.data ? itemsResult.data.items : [];

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
        emailError = 'Email remitente no configurado';
      } else {
        const requestOrigin = new URL(request.url).origin;
        const baseUrl = empresa.dominio ? `https://${empresa.dominio}` : requestOrigin;

        for (const target of emailTargets) {
          try {
            const itemsWithUrls = createdItems.map((item) => {
              const token = generateReservaToken(target.email, item.id, promo.id);
              const reservaUrl = `${baseUrl}/?tgtg=confirm&itemId=${encodeURIComponent(item.id)}&promoId=${encodeURIComponent(promo.id)}&email=${encodeURIComponent(target.email)}&token=${encodeURIComponent(token)}`;
              return { ...item, reservaUrl };
            });

            const html = buildTgtgEmailHtml({
              empresaLogoUrl: empresa.logoUrl || '',
              empresaNombre: empresa.nombre || 'Empresa',
              horaInicio: hora_recogida_inicio,
              horaFin: hora_recogida_fin,
              items: itemsWithUrls,
              baseUrl,
              empresaId: empresaId!,
              recipientEmail: target.email,
            });

            await sendEmail({
              to: [target.email],
              subject: `¡Ofertas TooGoodToGo de hoy! Recogida ${hora_recogida_inicio}–${hora_recogida_fin}`,
              htmlContent: html,
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
      }
    }

    if (emailError) {
      await logApiError('TGTG emails skipped', new Error(emailError), 'POST');
    }

    return NextResponse.json({ tgtgPromo: promo, emailsSent, emailError });
  } catch (error) {
    await logApiError('Create TGTG promo', error, 'POST');
    return errorResponse('Error interno');
  }
}
