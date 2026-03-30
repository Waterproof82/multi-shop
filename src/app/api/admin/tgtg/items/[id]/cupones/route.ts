import { NextRequest, NextResponse } from 'next/server';
import { tgtgUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { adjustCuponesSchema } from '@/core/application/dtos/tgtg.dto';

export async function PATCH(
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

  const { id: itemId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = adjustCuponesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  try {
    const result = await tgtgUseCase.adjustCupones(empresaId!, itemId, parsed.data.delta);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.code === 'NOT_FOUND' ? 404 : 500 });
    }
    return NextResponse.json({ item: result.data });
  } catch (error) {
    await logApiError('Adjust TGTG cupones', error, 'PATCH');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
