import { NextRequest, NextResponse } from 'next/server';
import { getPedidoRepository } from '@/core/infrastructure/database';
import type { ItemEstado } from '@/core/domain/repositories/IPedidoRepository';

export const dynamic = 'force-dynamic';

const VALID_ESTADOS: ItemEstado[] = ['pendiente', 'en_preparacion', 'listo', 'servido', 'retenido', 'cancelado'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pedidoId: string; itemIdx: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { pedidoId, itemIdx: itemIdxStr } = await params;
  const itemIdx = parseInt(itemIdxStr, 10);

  if (!pedidoId || isNaN(itemIdx)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const estado = (body as Record<string, unknown>)['estado'] as ItemEstado;
  if (!VALID_ESTADOS.includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const result = await getPedidoRepository().upsertItemEstado(empresaId, pedidoId, itemIdx, estado);

  if (!result.success) {
    return NextResponse.json({ error: 'Error al actualizar estado' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
