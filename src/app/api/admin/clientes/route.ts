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

    const { data: clientes, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ clientes });
  } catch (error) {
    console.error('Error fetching clientes:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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
    const { id, nombre, email, telefono, direccion, aceptar_promociones } = body;

    const updateData: Record<string, any> = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (email !== undefined) updateData.email = email;
    if (telefono !== undefined) updateData.telefono = telefono;
    if (direccion !== undefined) updateData.direccion = direccion;
    if (aceptar_promociones !== undefined) updateData.aceptar_promociones = aceptar_promociones;

    const { error } = await supabase
      .from('clientes')
      .update(updateData)
      .eq('id', id)
      .eq('empresa_id', perfil.empresa_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating cliente:', error);
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

    const body = await request.json();
    const { nombre, email, telefono, direccion } = body;

    if (!nombre && !email && !telefono) {
      return NextResponse.json({ error: 'Al menos un campo es requerido' }, { status: 400 });
    }

    const { data: cliente, error } = await supabase
      .from('clientes')
      .insert({
        empresa_id: perfil.empresa_id,
        nombre: nombre || null,
        email: email || null,
        telefono: telefono || null,
        direccion: direccion || null,
        aceptar_promociones: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ cliente });
  } catch (error) {
    console.error('Error creating cliente:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', id)
      .eq('empresa_id', perfil.empresa_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting cliente:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
