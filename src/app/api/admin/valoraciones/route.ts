import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult } from '@/core/infrastructure/api/helpers';
import { getValoracionUseCase } from '@/core/infrastructure/database';
import { z } from 'zod';

const pageSchema = z.coerce.number().int().min(0).default(0);

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveAdminContextWithEmpresa(request);
    if (ctx.error) return ctx.error;
    const { empresaId } = ctx;
    if (!empresaId) return NextResponse.json({ error: 'Se requiere empresaId' }, { status: 400 });

    const page = pageSchema.parse(request.nextUrl.searchParams.get('page') ?? '0');

    const [statsResult, listResult] = await Promise.all([
      getValoracionUseCase().getStats(empresaId),
      getValoracionUseCase().list(empresaId, page),
    ]);

    if (!statsResult.success) return handleResult(statsResult);
    if (!listResult.success) return handleResult(listResult);

    return handleResult({ success: true, data: { stats: statsResult.data, list: listResult.data } });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
