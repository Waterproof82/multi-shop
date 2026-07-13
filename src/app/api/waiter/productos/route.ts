import { NextRequest, NextResponse } from 'next/server';
import { getProductUseCase } from '@/core/infrastructure/database';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = await getProductUseCase().getAll(empresaId);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener los productos' }, { status: 500 });
  }

  return NextResponse.json({ productos: result.data });
}
