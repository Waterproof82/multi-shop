import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;

async function getAdminEmpresaId() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(ADMIN_TOKEN_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.empresaId as string;
  } catch {
    return null;
  }
}

export async function GET() {
  const empresaId = await getAdminEmpresaId();
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const empresaId = await getAdminEmpresaId();
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const {
    titulo_es, titulo_en, titulo_fr, titulo_it, titulo_de,
    descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
    precio, foto_url, categoria_id, es_especial, activo
  } = body;

  if (!titulo_es || !precio) {
    return NextResponse.json({ error: 'Título y precio son requeridos' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('productos')
    .insert({
      empresa_id: empresaId,
      titulo_es,
      titulo_en: titulo_en || null,
      titulo_fr: titulo_fr || null,
      titulo_it: titulo_it || null,
      titulo_de: titulo_de || null,
      descripcion_es: descripcion_es || null,
      descripcion_en: descripcion_en || null,
      descripcion_fr: descripcion_fr || null,
      descripcion_it: descripcion_it || null,
      descripcion_de: descripcion_de || null,
      precio: parseFloat(precio),
      foto_url: foto_url || null,
      categoria_id: categoria_id || null,
      es_especial: es_especial || false,
      activo: activo !== false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const empresaId = await getAdminEmpresaId();
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const body = await request.json();
  const {
    titulo_es, titulo_en, titulo_fr, titulo_it, titulo_de,
    descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
    precio, foto_url, categoria_id, es_especial, activo
  } = body;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('productos')
    .update({
      titulo_es,
      titulo_en: titulo_en || null,
      titulo_fr: titulo_fr || null,
      titulo_it: titulo_it || null,
      titulo_de: titulo_de || null,
      descripcion_es: descripcion_es || null,
      descripcion_en: descripcion_en || null,
      descripcion_fr: descripcion_fr || null,
      descripcion_it: descripcion_it || null,
      descripcion_de: descripcion_de || null,
      precio: parseFloat(precio),
      foto_url: foto_url || null,
      categoria_id: categoria_id || null,
      es_especial: es_especial || false,
      activo: activo !== false,
    })
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const empresaId = await getAdminEmpresaId();
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error } = await supabase
    .from('productos')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
