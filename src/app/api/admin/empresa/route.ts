import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;

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

    const { data: empresa } = await supabase
      .from('empresas')
      .select('email_notification, telefono_whatsapp')
      .eq('id', perfil.empresa_id)
      .single();

    return NextResponse.json({
      email_notification: empresa?.email_notification || '',
      telefono_whatsapp: empresa?.telefono_whatsapp || '',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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

    const body = await request.json();
    const { email_notification, telefono_whatsapp } = body;

    const { error } = await supabase
      .from('empresas')
      .update({ email_notification, telefono_whatsapp })
      .eq('id', perfil.empresa_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
