import { NextRequest, NextResponse } from 'next/server';
import { mesaSesionUseCase } from '@/core/infrastructure/database';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = await mesaSesionUseCase.getMesasWithSessions(empresaId);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener las mesas' }, { status: 500 });
  }

  return NextResponse.json({ mesas: result.data });
}
