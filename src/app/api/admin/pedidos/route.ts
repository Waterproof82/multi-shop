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

const pedidoIdSchema = z.object({
  id: z.string().uuid(),
});

const updatePedidoSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(['pendiente', 'aceptado', 'preparando', 'enviado', 'entregado', 'cancelado']),
});

export async function GET(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseClient();

    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select(`
        *,
        clientes:cliente_id (nombre, email, telefono)
      `)
      .eq('empresa_id', empresaId)
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

export async function PATCH(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updatePedidoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: parsed.data.estado })
      .eq('id', parsed.data.id)
      .eq('empresa_id', empresaId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating pedido:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = pedidoIdSchema.safeParse({ id: body.id });

    if (!parsed.success) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', parsed.data.id)
      .eq('empresa_id', empresaId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pedido:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const empresaId = getEmpresaId(request);
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const mesParam = searchParams.get('mes');
    const añoParam = searchParams.get('año');

    const now = new Date();
    const selectedMonth = mesParam ? Number.parseInt(mesParam) : now.getMonth();
    const selectedYear = añoParam ? Number.parseInt(añoParam) : now.getFullYear();

    const todayStart = new Date(selectedYear, selectedMonth, now.getDate()).toISOString();
    const monthStart = new Date(selectedYear, selectedMonth, 1).toISOString();
    const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).toISOString();
    const yearStart = new Date(selectedYear, 0, 1).toISOString();

    const supabase = getSupabaseClient();

    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('empresa_id', empresaId);

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
        pedido.detalle_pedido.forEach((item: Record<string, unknown>) => {
          const key = String(item.nombre);
          if (!dishCount[key]) {
            dishCount[key] = { nombre: key, cantidad: 0, total: 0 };
          }
          dishCount[key].cantidad += Number(item.cantidad) || 1;
          dishCount[key].total += (Number(item.precio) * (Number(item.cantidad) || 1));
        });
      }
    });

    const topPlatos = Object.values(dishCount)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    const dishCountAno: Record<string, { nombre: string; cantidad: number; total: number }> = {};
    pedidosAno.forEach(pedido => {
      if (pedido.detalle_pedido) {
        pedido.detalle_pedido.forEach((item: Record<string, unknown>) => {
          const key = String(item.nombre);
          if (!dishCountAno[key]) {
            dishCountAno[key] = { nombre: key, cantidad: 0, total: 0 };
          }
          dishCountAno[key].cantidad += Number(item.cantidad) || 1;
          dishCountAno[key].total += (Number(item.precio) * (Number(item.cantidad) || 1));
        });
      }
    });

    const topPlatosAno = Object.values(dishCountAno)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);

    return NextResponse.json({
      pedidosHoy: pedidosHoy.length,
      pedidosMes: pedidosMes.length,
      totalHoy,
      totalMes,
      totalAno,
      topPlatos,
      topPlatosAno,
      mesSeleccionado: `${selectedMonth}-${selectedYear}`,
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
