import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMesaSesionUseCase, getMesaSesionRepository, getPedidoRepository } from '@/core/infrastructure/database';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const sesionResult = await getMesaSesionRepository().findActiveSesionByMesa(parsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar la sesión activa' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'No hay sesión activa para esta mesa' }, { status: 404 });
  }

  const sesionId = sesionResult.data.id;

  // Merge all individual orders into a single ticket
  await getPedidoRepository().consolidateSesionOrders(sesionId);

  const result = await getMesaSesionUseCase().closeSesion(sesionId);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al cerrar la sesión de mesa' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
