import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionRepository } from '@/core/infrastructure/database';
import { removeSessionItemUseCase } from '@/core/application/use-cases/mesa/removeSessionItemUseCase';

const mesaIdSchema = z.string().uuid();

const bodySchema = z.object({
  nombre: z.string().min(1).max(200),
  precio: z.number().nonnegative(),
  cantidadAEliminar: z.number().int().min(1).max(100),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const mesaParsed = mesaIdSchema.safeParse(mesaId);
  if (!mesaParsed.success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
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

  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(mesaParsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar sesión activa' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'Sin sesión activa' }, { status: 404 });
  }

  const sesion = sesionResult.data;

  if (sesion.sesionPagada || sesion.pagoEnCurso) {
    return NextResponse.json({ error: 'La sesión ya está en proceso de pago' }, { status: 409 });
  }

  const result = await removeSessionItemUseCase({
    sesionId: sesion.id,
    empresaId,
    nombre: parsed.data.nombre,
    precio: parsed.data.precio,
    cantidadAEliminar: parsed.data.cantidadAEliminar,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'Error al eliminar el producto' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, totalRemoved: result.data.totalRemoved });
}
