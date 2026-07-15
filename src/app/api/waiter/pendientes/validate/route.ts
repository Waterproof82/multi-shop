import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  pedidoId: z.string().uuid(),
  retainIndices: z.array(z.number().int().min(0)).max(50).default([]),
  pausedIndices: z.array(z.number().int().min(0)).max(50).default([]),
});

export async function POST(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { pedidoId, retainIndices, pausedIndices } = parsed.data;
  const result = await getPedidoRepository().validatePedido(empresaId, pedidoId, retainIndices, pausedIndices);

  if (!result.success) {
    if (result.error.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    if (result.error.code === 'CONFLICT') {
      return NextResponse.json({ error: result.error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al validar pedido' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
