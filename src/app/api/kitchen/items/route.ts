import { NextRequest, NextResponse } from 'next/server';
import { getPedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = await getPedidoRepository().findWaiterKitchenItems(empresaId);

  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener ítems de cocina' }, { status: 500 });
  }

  // Standalone kitchen only shows active work (pendiente/en_preparacion/retenido).
  // Listo items are handled by the waiter — they disappear from the chef's view.
  const activeItems = result.data.filter(i => i.estado !== 'listo');

  return NextResponse.json({ items: activeItems });
}
