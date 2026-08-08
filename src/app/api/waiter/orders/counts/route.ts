import { NextRequest, NextResponse } from 'next/server';
import { getPedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Un unico roundtrip: cocina, bebidas, pendientes y llamadas se agregan en SQL.
  // El WaiterBanner llama a esta ruta en cada evento de Realtime, asi que su coste
  // marca el ritmo de todo el panel.
  const result = await getPedidoRepository().getWaiterBadgeCounts(empresaId);

  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener conteos' }, { status: 500 });
  }

  return NextResponse.json(result.data);
}
