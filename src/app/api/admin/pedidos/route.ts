import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pedidoRepository } from '@/core/infrastructure/database';
import { requireAuth, successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';

const pedidoIdSchema = z.object({
  id: z.string().uuid(),
});

const updatePedidoSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(['pendiente', 'aceptado', 'preparando', 'enviado', 'entregado', 'cancelado']),
});

export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  try {
    const pedidos = await pedidoRepository.findAllByTenant(empresaId!);
    return successResponse({ pedidos });
  } catch {
    return errorResponse('Error al obtener pedidos');
  }
}

export async function PATCH(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = updatePedidoSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  try {
    await pedidoRepository.updateStatus(parsed.data.id, empresaId!, parsed.data.estado);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Error al actualizar pedido');
  }
}

export async function DELETE(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = pedidoIdSchema.safeParse({ id: body.id });

  if (!parsed.success) {
    return validationErrorResponse('ID inválido');
  }

  try {
    // Note: delete not in repository yet, need to add
    const { getSupabaseClient } = await import('@/core/infrastructure/database/supabase-client');
    const supabase = getSupabaseClient();
    await supabase.from('pedidos').delete().eq('id', parsed.data.id).eq('empresa_id', empresaId);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Error al eliminar pedido');
  }
}

export async function PUT(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;

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

    const { getSupabaseClient } = await import('@/core/infrastructure/database/supabase-client');
    const supabase = getSupabaseClient();

    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('*')
      .eq('empresa_id', empresaId);

    const pedidosFiltrados = pedidos || [];

    const pedidosHoy = pedidosFiltrados.filter(p => {
      const fecha = new Date(p.created_at);
      return fecha >= new Date(todayStart) && fecha <= new Date(monthEnd);
    });
    const pedidosMes = pedidosFiltrados.filter(p => new Date(p.created_at) >= new Date(monthStart) && new Date(p.created_at) <= new Date(monthEnd));
    const pedidosAno = pedidosFiltrados.filter(p => new Date(p.created_at) >= new Date(yearStart));

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

    return successResponse({
      pedidosHoy: pedidosHoy.length,
      pedidosMes: pedidosMes.length,
      totalHoy,
      totalMes,
      totalAno,
      topPlatos,
      topPlatosAno,
      mesSeleccionado: `${selectedMonth}-${selectedYear}`,
    });
  } catch {
    return errorResponse('Error al obtener estadísticas');
  }
}
