import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { sendEmail } from '@/lib/brevo-email';
import { deleteImageFromR2 } from '@/core/infrastructure/storage/s3-client';
import { promocionRepository, adminRepository } from '@/core/infrastructure/database';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// Helper to get admin empresaId from JWT cookie
async function getAdminEmpresaId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(ADMIN_TOKEN_SECRET));
    const adminId = payload.adminId as string;
    const perfil = await adminRepository.findById(adminId);
    return perfil?.empresaId || null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const empresaId = await getAdminEmpresaId();
    if (!empresaId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const promociones = await promocionRepository.findAllByTenant(empresaId);
    return NextResponse.json({ promociones });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const empresaId = await getAdminEmpresaId();
    if (!empresaId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { getSupabaseClient } = await import('@/core/infrastructure/database/supabase-client');
    const supabase = getSupabaseClient();

    const { data: empresa } = await supabase
      .from('empresas')
      .select('nombre, logo_url, email_notification, dominio')
      .eq('id', empresaId)
      .single();

    const body = await request.json();
    const { texto_promocion, imagen_url } = body;

    if (!texto_promocion) {
      return NextResponse.json({ error: 'El texto de promoción es requerido' }, { status: 400 });
    }

    // Get clientes with promotions
    const { data: clientesConPromo } = await supabase
      .from('clientes')
      .select('email')
      .eq('empresa_id', empresaId)
      .eq('aceptar_promociones', true)
      .not('email', 'is', null);

    const emails = clientesConPromo?.map(c => c.email).filter(Boolean) || [];
    const numeroEnvios = emails.length;

    // Delete old promo image if exists
    const { data: oldPromo } = await supabase
      .from('promociones')
      .select('imagen_url')
      .eq('empresa_id', empresaId)
      .single();

    if (oldPromo?.imagen_url) {
      await deleteImageFromR2(oldPromo.imagen_url);
    }

    // Delete old promotions
    await promocionRepository.deleteAllByTenant(empresaId);

    // Create new promotion
    const promo = await promocionRepository.create({
      empresaId,
      texto_promocion,
      imagen_url,
      numero_envios: numeroEnvios,
    });

    // Send emails via Brevo
    if (BREVO_API_KEY && numeroEnvios > 0 && emails.length > 0) {
      const empresaLogoUrl = empresa?.logo_url || '';
      
      const baseUrl = empresa?.dominio 
      ? `https://${empresa.dominio}` 
      : (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.almadearena.es');
    
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow-hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    ${empresaLogoUrl ? `<img src="${empresaLogoUrl}" alt="${empresa?.nombre || 'Empresa'}" style="width: 100%; max-width: 200px; display: block; margin: 20px auto;">` : ''}
    <div style="padding: 20px;">
      <h2 style="margin: 0 0 16px; color: #333; text-align: center;">Nueva promoción disponible</h2>
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="margin: 0; color: #555; line-height: 1.6;">${texto_promocion}</p>
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

      for (const email of emails) {
        const personalizedHtml = emailHtml.replace(/__EMAIL__/g, encodeURIComponent(email));
        
        await sendEmail({
          to: [email],
          subject: 'Nueva promocion disponible',
          htmlContent: personalizedHtml,
          senderName: empresa?.nombre || 'Promociones',
          senderEmail: empresa?.email_notification || 'a369cb001@smtp-brevo.com',
        });
      }
    }

    return NextResponse.json({ promocion: promo });
  } catch (error) {
    console.error('Error creating promocion:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
