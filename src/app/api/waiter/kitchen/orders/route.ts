import { NextRequest, NextResponse } from 'next/server';
import { pedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const ordersResult = await pedidoRepository.findKitchenOrders(empresaId);

  if (!ordersResult.success) {
    return NextResponse.json({ error: 'Error al obtener pedidos de cocina' }, { status: 500 });
  }

  return NextResponse.json({ orders: ordersResult.data });
}
