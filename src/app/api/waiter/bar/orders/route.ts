import { NextRequest, NextResponse } from 'next/server';
import { pedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const [ordersResult, retenidosComidaResult, retenidaBebidasResult] = await Promise.all([
    pedidoRepository.findBarOrders(empresaId),
    pedidoRepository.findAllRetenidos(empresaId, 'comida'),
    pedidoRepository.findAllRetenidos(empresaId, 'bebida'),
  ]);

  if (!ordersResult.success) {
    return NextResponse.json({ error: 'Error al obtener pedidos de bar' }, { status: 500 });
  }

  const retenidos = [
    ...(retenidosComidaResult.success ? retenidosComidaResult.data : []),
    ...(retenidaBebidasResult.success ? retenidaBebidasResult.data : []),
  ];

  return NextResponse.json({ orders: ordersResult.data, retenidos });
}
