import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/brevo-email';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, new TextEncoder().encode(ADMIN_TOKEN_SECRET));
    const adminId = payload.adminId as string;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: perfil } = await supabase
      .from('perfiles_admin')
      .select('empresa_id')
      .eq('id', adminId)
      .single();

    if (!perfil) {
      return NextResponse.json({ error: 'Admin no encontrado' }, { status: 404 });
    }

    const { data: promociones, error } = await supabase
      .from('promociones')
      .select('*')
      .eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ promociones });
  } catch (error) {
    console.error('Error fetching promociones:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, new TextEncoder().encode(ADMIN_TOKEN_SECRET));
    const adminId = payload.adminId as string;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: perfil } = await supabase
      .from('perfiles_admin')
      .select('empresa_id')
      .eq('id', adminId)
      .single();

    if (!perfil) {
      return NextResponse.json({ error: 'Admin no encontrado' }, { status: 404 });
    }

    const { data: empresa } = await supabase
      .from('empresas')
      .select('email_notification, nombre, logo_url')
      .eq('id', perfil.empresa_id)
      .single();

    const body = await request.json();
    const { texto_promocion, imagen_base64 } = body;

    if (!texto_promocion) {
      return NextResponse.json({ error: 'Falta el texto de la promoción' }, { status: 400 });
    }

    const { data: clientesConPromo } = await supabase
      .from('clientes')
      .select('email')
      .eq('empresa_id', perfil.empresa_id)
      .eq('aceptar_promociones', true)
      .not('email', 'is', null);

    const emails = clientesConPromo?.map(c => c.email).filter(Boolean) || [];
    const numeroEnvios = emails.length;
    console.log('Clientes con promociones:', numeroEnvios, clientesConPromo);

    // Eliminar promociones anteriores de esta empresa
    await supabase
      .from('promociones')
      .delete()
      .eq('empresa_id', perfil.empresa_id);

    // Don't store imagen in DB - just use it for email
    const { data: promo, error } = await supabase
      .from('promociones')
      .insert({
        empresa_id: perfil.empresa_id,
        fecha_hora: new Date().toISOString(),
        texto_promocion,
        numero_envios: numeroEnvios,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (BREVO_API_KEY && numeroEnvios > 0) {
      const emails = clientesConPromo?.map(c => c.email).filter(Boolean) as string[];
      
      console.log('Enviando a emails:', emails);
      console.log('BREVO_API_KEY configurado:', !!BREVO_API_KEY);
      
      if (emails && emails.length > 0) {
        const empresaLogoUrl = empresa?.logo_url || '';
        
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    ${empresaLogoUrl ? `
    <div style="padding: 24px; text-align: center; background-color: #ffffff;">
      <img src="${empresaLogoUrl}" alt="Logo" style="max-width: 180px; max-height: 80px; height: auto; display: inline-block;">
    </div>
    ` : `
    <div style="background-color: #1a1a1a; padding: 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${empresa?.nombre || 'Promociones'}</h1>
    </div>
    `}
    ${imagen_base64 ? `
    <div style="padding: 0;">
      <img src="${imagen_base64}" alt="Promoción" style="width: 100%; max-width: 500px; height: auto; display: block;">
    </div>
    ` : ''}
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px 0; color: #333333; font-size: 16px; line-height: 1.5;">
        ${texto_promocion}
      </p>
      <p style="margin: 0; color: #888888; font-size: 14px;">
        Muestra este mensaje para canjear la promoción.
      </p>
    </div>
    <div style="background-color: #f9f9f9; padding: 16px; text-align: center;">
      <p style="margin: 0; color: #888888; font-size: 12px;">
        <a href="/api/admin/promociones/unsubscribe?email=__EMAIL__&empresa=${perfil.empresa_id}" style="color: #008C45;">Gestionar preferencias de promociones</a>
      </p>
    </div>
  </div>
</body>
</html>
        `.trim();

          // Enviar emails individualmente para incluir el link de baja personalizado
          for (const email of emails) {
            const personalizedHtml = emailHtml.replace('__EMAIL__', encodeURIComponent(email));
            
            await sendEmail({
              to: [email],
              subject: 'Nueva promocion disponible',
              htmlContent: personalizedHtml,
              senderName: empresa?.nombre || 'Promociones',
              senderEmail: empresa?.email_notification || 'a369cb001@smtp-brevo.com',
            });
          }
          
          console.log('Promo emails sent successfully via Brevo');
      }
    }

    return NextResponse.json({ promocion: promo });
  } catch (error) {
    console.error('Error creating promocion:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
