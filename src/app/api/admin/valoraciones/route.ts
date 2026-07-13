import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, handleResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { getValoracionUseCase } from '@/core/infrastructure/database';
import { z } from 'zod';

const pageSchema = z.coerce.number().int().min(0).default(0);

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await rateLimitAdmin(request);
    if (rateLimited) return rateLimited;

    const { empresaId, error } = await requireAuth(request);
    if (error) return error;
    if (!empresaId) return NextResponse.json({ error: 'Se requiere empresaId' }, { status: 400 });

    const page = pageSchema.parse(request.nextUrl.searchParams.get('page') ?? '0');

    const [statsResult, listResult] = await Promise.all([
      getValoracionUseCase().getStats(empresaId!),
      getValoracionUseCase().list(empresaId!, page),
    ]);

    if (!statsResult.success) return handleResult(statsResult);
    if (!listResult.success) return handleResult(listResult);

    return handleResult({ success: true, data: { stats: statsResult.data, list: listResult.data } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[valoraciones GET]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
