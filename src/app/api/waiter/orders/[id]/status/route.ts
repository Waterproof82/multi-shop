import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPedidoRepository } from '@/core/infrastructure/database';

const bodySchema = z.object({
  estado: z.enum(['pendiente', 'anotado', 'preparado', 'servido']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await getPedidoRepository().updateStatusById(id, parsed.data.estado);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al actualizar estado' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
