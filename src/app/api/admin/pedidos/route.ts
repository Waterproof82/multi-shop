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

    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select(`
        *,
        clientes:cliente_id (nombre, email, telefono)
      `)
      .eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pedidos });
  } catch (error) {
    console.error('Error fetching pedidos:', error);
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
    const { id, estado } = body;

    const { error } = await supabase
      .from('pedidos')
      .update({ estado })
      .eq('id', id)
      .eq('empresa_id', perfil.empresa_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating pedido:', error);
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

    const { error } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', id)
      .eq('empresa_id', perfil.empresa_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pedido:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mesParam = searchParams.get('mes');
    const añoParam = searchParams.get('año');

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

    const now = new Date();
    const selectedMonth = mesParam !== null ? parseInt(mesParam) : now.getMonth();
    const selectedYear = añoParam !== null ? parseInt(añoParam) : now.getFullYear();

    const todayStart = new Date(selectedYear, selectedMonth, now.getDate()).toISOString();
    const monthStart = new Date(selectedYear, selectedMonth, 1).toISOString();
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).toISOString();
    const yearStart = new Date(selectedYear, 0, 1).toISOString();

    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('empresa_id', perfil.empresa_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pedidosHoy = pedidos?.filter(p => {
      const fecha = new Date(p.created_at);
      return fecha >= new Date(todayStart) && fecha <= new Date(monthEnd);
    }) || [];
    const pedidosMes = pedidos?.filter(p => new Date(p.created_at) >= new Date(monthStart) && new Date(p.created_at) <= new Date(monthEnd)) || [];
    const pedidosAno = pedidos?.filter(p => new Date(p.created_at) >= new Date(yearStart)) || [];

    const totalHoy = pedidosHoy.reduce((sum, p) => sum + (p.total || 0), 0);
    const totalMes = pedidosMes.reduce((sum, p) => sum + (p.total || 0), 0);
    const totalAno = pedidosAno.reduce((sum, p) => sum + (p.total || 0), 0);

    const dishCount: Record<string, { nombre: string; cantidad: number; total: number }> = {};
    pedidosMes.forEach(pedido => {
      if (pedido.detalle_pedido) {
        pedido.detalle_pedido.forEach((item: any) => {
          const key = item.nombre;
          if (!dishCount[key]) {
            dishCount[key] = { nombre: item.nombre, cantidad: 0, total: 0 };
          }
          dishCount[key].cantidad += item.cantidad || 1;
          dishCount[key].total += (item.precio * (item.cantidad || 1));
        });
      }
    });

    const topPlatos = Object.values(dishCount)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    return NextResponse.json({
      pedidosHoy: pedidosHoy.length,
      pedidosMes: pedidosMes.length,
      totalHoy,
      totalMes,
      totalAno,
      topPlatos,
      mesSeleccionado: `${selectedMonth}-${selectedYear}`,
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
