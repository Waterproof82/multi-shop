import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/brevo-email';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const empresaId = searchParams.get('empresa');

    if (!email || !empresaId) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Obtener datos del cliente
    const { data: cliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('email', email)
      .single();

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }

    // Obtener email de la empresa
    const { data: empresa } = await supabase
      .from('empresas')
      .select('email_notification, nombre')
      .eq('id', empresaId)
      .single();

    // Actualizar cliente para no recibir promociones
    await supabase
      .from('clientes')
      .update({ aceptar_promociones: false })
      .eq('id', cliente.id);

    // Enviar email a la empresa notificando la baja
    if (BREVO_API_KEY && empresa?.email_notification) {
      const notifyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body>
  <p>Un cliente ha solicitado darse de baja de las promociones.</p>
  <p><strong>Email:</strong> ${email}</p>
  <p><strong>Nombre:</strong> ${cliente.nombre || 'No especificado'}</p>
  <p><strong>Teléfono:</strong> ${cliente.telefono || 'No especificado'}</p>
</body>
</html>
      `.trim();

      await sendEmail({
        to: [empresa.email_notification],
        subject: 'Solicitud de baja de promociones',
        htmlContent: notifyHtml,
        senderName: 'Sistema de Promociones',
        senderEmail: 'a369cb001@smtp-brevo.com',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing unsubscribe:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
