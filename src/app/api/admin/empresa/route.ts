import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Configuración de Supabase incompleta");
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

function getEmpresaId(request: NextRequest): string | null {
  return request.headers.get('x-empresa-id');
}

const updateEmpresaSchema = z.object({
  email_notification: z.string().email().optional().or(z.literal('')),
  telefono_whatsapp: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  const { data: empresa } = await supabase
    .from('empresas')
    .select('email_notification, telefono_whatsapp, nombre, logo_url')
    .eq('id', empresaId)
    .single();

  return NextResponse.json({
    email_notification: empresa?.email_notification || '',
    telefono_whatsapp: empresa?.telefono_whatsapp || '',
    nombre: empresa?.nombre || '',
    logo_url: empresa?.logo_url || null,
  });
}

export async function PUT(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateEmpresaSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('empresas')
    .update({ 
      email_notification: parsed.data.email_notification || null,
      telefono_whatsapp: parsed.data.telefono_whatsapp || null,
    })
    .eq('id', empresaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
