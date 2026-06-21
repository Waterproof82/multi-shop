import { NextRequest, NextResponse } from 'next/server';
import { pedidoRepository } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  const [result, pendientesResult, llamadasResult] = await Promise.all([
    pedidoRepository.countKitchenBarOrders(empresaId),
    pedidoRepository.findPendientesValidacion(empresaId),
    supabase
      .from('mesa_sesiones')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('llamada_activa', true)
      .is('cerrada_at', null),
  ]);

  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener conteos' }, { status: 500 });
  }

  const pendientesCount = pendientesResult.success
    ? pendientesResult.data.reduce((s, m) => s + m.pedidos.reduce((sp, p) => sp + p.items.length, 0), 0)
    : 0;

  return NextResponse.json({ ...result.data, pendientes: pendientesCount, llamadas: llamadasResult.count ?? 0 });
}
