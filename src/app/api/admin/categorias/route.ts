import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const queryIdSchema = z.object({
  id: z.string().uuid(),
});

const createCategoryBodySchema = z.object({
  nombre_es: z.string().min(1, "El nombre en español es requerido"),
  nombre_en: z.string().optional(),
  nombre_fr: z.string().optional(),
  nombre_it: z.string().optional(),
  nombre_de: z.string().optional(),
  descripcion_es: z.string().optional(),
  descripcion_en: z.string().optional(),
  descripcion_fr: z.string().optional(),
  descripcion_it: z.string().optional(),
  descripcion_de: z.string().optional(),
  orden: z.number().int().default(0),
  categoria_complemento_de: z.string().uuid().nullable().optional(),
  complemento_obligatorio: z.boolean().default(false),
  categoria_padre_id: z.string().uuid().nullable().optional(),
});

const updateCategoryBodySchema = createCategoryBodySchema.partial();

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Configuración de Supabase incompleta");
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

function getDefinedValues<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function getEmpresaId(request: NextRequest): string | null {
  return request.headers.get('x-empresa-id');
}

export async function GET(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseClient();

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
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createCategoryBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('categorias')
    .insert({
      empresa_id: empresaId,
      nombre_es: parsed.data.nombre_es,
      nombre_en: parsed.data.nombre_en || null,
      nombre_fr: parsed.data.nombre_fr || null,
      nombre_it: parsed.data.nombre_it || null,
      nombre_de: parsed.data.nombre_de || null,
      descripcion_es: parsed.data.descripcion_es || null,
      descripcion_en: parsed.data.descripcion_en || null,
      descripcion_fr: parsed.data.descripcion_fr || null,
      descripcion_it: parsed.data.descripcion_it || null,
      descripcion_de: parsed.data.descripcion_de || null,
      orden: parsed.data.orden,
      categoria_complemento_de: parsed.data.categoria_complemento_de || null,
      complemento_obligatorio: parsed.data.complemento_obligatorio,
      categoria_padre_id: parsed.data.categoria_padre_id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');

  const idParsed = queryIdSchema.safeParse({ id: idParam });
  if (!idParsed.success) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = updateCategoryBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();

  const updateData = getDefinedValues(parsed.data);

  const { data, error } = await supabase
    .from('categorias')
    .update(updateData)
    .eq('id', idParsed.data.id)
    .eq('empresa_id', empresaId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');

  const idParsed = queryIdSchema.safeParse({ id: idParam });
  if (!idParsed.success) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('categorias')
    .delete()
    .eq('id', idParsed.data.id)
    .eq('empresa_id', empresaId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
