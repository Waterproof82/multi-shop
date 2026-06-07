import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { tgtgUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';

const updateHorasSchema = z.object({
  hora_recogida_inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  hora_recogida_fin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
});

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

  const { id: tgtgPromoId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = updateHorasSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  try {
    const result = await tgtgUseCase.updateHoras(
      empresaId!,
      tgtgPromoId,
      parsed.data.hora_recogida_inicio,
      parsed.data.hora_recogida_fin,
    );
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: result.error.code === 'NOT_FOUND' ? 404 : 500 });
    }
    return NextResponse.json({ tgtgPromo: result.data });
  } catch (error) {
    await logApiError('Update TGTG horas', error, 'PATCH');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
