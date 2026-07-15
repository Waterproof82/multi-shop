import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMesaSesionUseCase } from '@/core/infrastructure/database';

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

  const result = await getMesaSesionUseCase().openSesion(parsed.data, empresaId);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al abrir la sesión de mesa' }, { status: 500 });
  }

  return NextResponse.json({ sesionId: result.data });
}
