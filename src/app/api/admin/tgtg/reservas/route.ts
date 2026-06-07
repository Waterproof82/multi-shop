import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { tgtgUseCase } from '@/core/infrastructure/database';
import { requireAuth } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';

const querySchema = z.object({
  tgtgPromoId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as { empresaId: string | null; error: NextResponse | null; isSuperAdmin: boolean };
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const parsed = querySchema.safeParse({ tgtgPromoId: searchParams.get('tgtgPromoId') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'tgtgPromoId requerido' }, { status: 400 });
  }

  try {
    const result = await tgtgUseCase.getReservas(empresaId!, parsed.data.tgtgPromoId);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    return NextResponse.json({ reservas: result.data });
  } catch (error) {
    await logApiError('Get TGTG reservas', error, 'GET');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
