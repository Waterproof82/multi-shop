import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTgtgUseCase } from '@/core/infrastructure/database';
import { resolveAdminContext } from '@/core/infrastructure/api/helpers';
import { logApiError } from '@/core/infrastructure/api/api-logger';

const querySchema = z.object({
  tgtgPromoId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { searchParams } = new URL(request.url);

  const parsed = querySchema.safeParse({ tgtgPromoId: searchParams.get('tgtgPromoId') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'tgtgPromoId requerido' }, { status: 400 });
  }

  try {
    const result = await getTgtgUseCase().getReservas(empresaId!, parsed.data.tgtgPromoId);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    return NextResponse.json({ reservas: result.data });
  } catch (error) {
    await logApiError('Get TGTG reservas', error, 'GET');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
