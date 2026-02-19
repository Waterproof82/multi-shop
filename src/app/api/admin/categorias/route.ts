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
    .from('categorias')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('orden', { ascending: true });

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
  const { nombre_es, nombre_en, nombre_fr, nombre_it, nombre_de, orden } = body;

  if (!nombre_es) {
    return NextResponse.json({ error: 'El nombre en español es requerido' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('categorias')
    .insert({
      empresa_id: empresaId,
      nombre_es,
      nombre_en: nombre_en || null,
      nombre_fr: nombre_fr || null,
      nombre_it: nombre_it || null,
      nombre_de: nombre_de || null,
      orden: orden || 0,
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
  const { nombre_es, nombre_en, nombre_fr, nombre_it, nombre_de, orden } = body;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('categorias')
    .update({
      nombre_es,
      nombre_en: nombre_en || null,
      nombre_fr: nombre_fr || null,
      nombre_it: nombre_it || null,
      nombre_de: nombre_de || null,
      orden: orden || 0,
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
    .from('categorias')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
