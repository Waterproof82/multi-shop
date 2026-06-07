import { NextRequest, NextResponse } from 'next/server';
import { tgtgUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as { empresaId: string | null; error: NextResponse | null; isSuperAdmin: boolean };
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const { id: promoId } = await params;

  try {
    const result = await tgtgUseCase.deletePromo(empresaId!, promoId);
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
