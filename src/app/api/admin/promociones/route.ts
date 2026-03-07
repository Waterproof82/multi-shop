import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/brevo-email';
import { deleteImageFromR2 } from '@/core/infrastructure/storage/s3-client';
import { promocionRepository, empresaRepository, clienteRepository } from '@/core/infrastructure/database';
import { requireAuth, errorResponse } from '@/core/infrastructure/api/helpers';

const BREVO_API_KEY = process.env.BREVO_API_KEY;

const createPromocionSchema = z.object({
  texto_promocion: z.string().min(1, 'El texto de promoción es requerido').max(1000),
  imagen_url: z.string().url().optional().nullable(),
});

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildEmailHtml(params: {
  empresaLogoUrl: string;
  empresaNombre: string;
  textoEscapado: string;
  imagen_url: string | undefined;
  baseUrl: string;
  empresaId: string;
}): string {
  const { empresaLogoUrl, empresaNombre, textoEscapado, imagen_url, baseUrl, empresaId } = params;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    ${empresaLogoUrl ? `<img src="${empresaLogoUrl}" alt="${escapeHtml(empresaNombre)}" style="width: 100%; max-width: 200px; display: block; margin: 20px auto;">` : ''}
    <div style="padding: 20px;">
      <h2 style="margin: 0 0 16px; color: #333; text-align: center;">Nueva promoción disponible</h2>
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="margin: 0; color: #555; line-height: 1.6;">${textoEscapado}</p>
      </div>
      ${imagen_url ? `<img src="${imagen_url}" alt="Promoción" style="width: 100%; border-radius: 8px; margin-bottom: 16px;">` : ''}
      <p style="margin: 16px 0 8px; font-size: 12px; color: #999; text-align: center;">
        <a href="${baseUrl}/api/unsubscribe?email=__EMAIL__&empresa=${empresaId}" style="color: #dc2626; text-decoration: underline;">Dar de baja las promociones</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
        <a href="${baseUrl}/api/unsubscribe?email=__EMAIL__&empresa=${empresaId}" style="color: #16a34a; text-decoration: underline;">Volver a dar de alta</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const promociones = await promocionRepository.findAllByTenant(empresaId!);
    return NextResponse.json({ promociones });
  } catch {
    return errorResponse('Error interno');
  }
}

export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const empresa = await empresaRepository.getById(empresaId!);

    const body = await request.json();
    const parsed = createPromocionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { texto_promocion, imagen_url } = parsed.data;

    // Get clientes with promotions - need to fetch from clienteRepository
    const clientes = await clienteRepository.findAllByTenant(empresaId!);
    const clientesConPromo = clientes.filter(c => c.aceptar_promociones && c.email);
    const emails = clientesConPromo.map(c => c.email).filter(Boolean) as string[];
    const numeroEnvios = emails.length;

    // Get old promo to delete image
    const oldPromos = await promocionRepository.findAllByTenant(empresaId!);
    const oldPromo = oldPromos[0];

    if (oldPromo?.imagen_url) {
      await deleteImageFromR2(oldPromo.imagen_url);
    }

    // Delete old promotions
    await promocionRepository.deleteAllByTenant(empresaId!);

    // Create new promotion
    const promo = await promocionRepository.create({
      empresaId: empresaId!,
      texto_promocion,
      imagen_url: imagen_url ?? undefined,
      numero_envios: numeroEnvios,
    });

    // Send emails via Brevo
    if (BREVO_API_KEY && numeroEnvios > 0 && emails.length > 0 && empresa) {
      const empresaLogoUrl = empresa.logoUrl || '';
      const baseUrl = empresa.dominio ? `https://${empresa.dominio}` : '';

      if (baseUrl) {
        const emailHtml = buildEmailHtml({
          empresaLogoUrl,
          empresaNombre: empresa.nombre || 'Empresa',
          textoEscapado: escapeHtml(texto_promocion),
          imagen_url: imagen_url ?? undefined,
          baseUrl,
          empresaId: empresaId!,
        });

        for (const email of emails) {
          const personalizedHtml = emailHtml.replaceAll('__EMAIL__', encodeURIComponent(email));
          await sendEmail({
            to: [email],
            subject: 'Nueva promocion disponible',
            htmlContent: personalizedHtml,
            senderName: empresa.nombre || 'Promociones',
            senderEmail: empresa.emailNotification || 'a369cb001@smtp-brevo.com',
          });
        }
      }
    }

    return NextResponse.json({ promocion: promo });
  } catch (error) {
    console.error('Error creating promocion:', error);
    return errorResponse('Error interno');
  }
}
