import { NextRequest, NextResponse } from 'next/server';
import { pedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = await pedidoRepository.countKitchenBarOrders(empresaId);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener conteos' }, { status: 500 });
  }

  return NextResponse.json(result.data);
}
