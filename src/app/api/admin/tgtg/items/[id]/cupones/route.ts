import { NextRequest, NextResponse } from 'next/server';
import { getTgtgUseCase } from '@/core/infrastructure/database';
import { resolveAdminContextWithEmpresa } from '@/core/infrastructure/api/helpers';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { adjustCuponesSchema } from '@/core/application/dtos/tgtg.dto';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

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
    const result = await getTgtgUseCase().adjustCupones(empresaId, itemId, parsed.data.delta);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.code === 'NOT_FOUND' ? 404 : 500 });
    }
    return NextResponse.json({ item: result.data });
  } catch (error) {
    await logApiError('Adjust TGTG cupones', error, 'PATCH');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
