import { NextRequest, NextResponse } from 'next/server';
import { pedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const [result, pendientesResult] = await Promise.all([
    pedidoRepository.countKitchenBarOrders(empresaId),
    pedidoRepository.findPendientesValidacion(empresaId),
  ]);

  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener conteos' }, { status: 500 });
  }

  const pendientesCount = pendientesResult.success
    ? pendientesResult.data.reduce((s, m) => s + m.pedidos.reduce((sp, p) => sp + p.items.length, 0), 0)
    : 0;

  return NextResponse.json({ ...result.data, pendientes: pendientesCount });
}
