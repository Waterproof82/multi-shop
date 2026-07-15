import { NextRequest, NextResponse } from 'next/server';
import { getTgtgUseCase } from '@/core/infrastructure/database';
import { resolveAdminContextWithEmpresa } from '@/core/infrastructure/api/helpers';
import { logApiError } from '@/core/infrastructure/api/api-logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { id: promoId } = await params;

  try {
    const result = await getTgtgUseCase().deletePromo(empresaId, promoId);
    if (!result.success) {
      const status = result.error.code === 'NOT_FOUND' ? 404
        : result.error.code === 'ALREADY_SENT' || result.error.code === 'HAS_RESERVAS' ? 409
        : 500;
      return NextResponse.json({ code: result.error.code, error: result.error.message }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    await logApiError('Delete TGTG promo', error, 'DELETE');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
