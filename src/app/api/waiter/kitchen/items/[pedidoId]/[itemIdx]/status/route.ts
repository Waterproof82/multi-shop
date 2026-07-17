import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPedidoRepository } from '@/core/infrastructure/database';
import type { ItemEstado } from '@/core/domain/repositories/IPedidoRepository';

export const dynamic = 'force-dynamic';

const schema = z.object({
  estado: z.enum(['pendiente', 'retenido', 'servido', 'cancelado']).optional(),
  pase: z.enum(['primer', 'segundo', 'postre']).nullable().optional(),
}).refine(d => d.estado !== undefined || d.pase !== undefined, { message: 'Se requiere estado o pase' });

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
  if (isNaN(itemIdx) || itemIdx < 0) {
    return NextResponse.json({ error: 'itemIdx inválido' }, { status: 400 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Estado inválido', details: parsed.error.flatten() }, { status: 400 });
  }

  const { estado, pase } = parsed.data;

  if (estado !== undefined) {
    const result = await getPedidoRepository().upsertItemEstado(empresaId, pedidoId, itemIdx, estado as ItemEstado);
    if (!result.success) return NextResponse.json({ error: 'Error al actualizar estado' }, { status: 500 });
  }

  if (pase !== undefined) {
    const result = await getPedidoRepository().updateItemPase(empresaId, pedidoId, itemIdx, pase);
    if (!result.success) return NextResponse.json({ error: 'Error al actualizar pase' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
