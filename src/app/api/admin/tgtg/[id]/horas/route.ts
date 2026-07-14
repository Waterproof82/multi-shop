import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTgtgUseCase } from '@/core/infrastructure/database';
import { resolveAdminContextWithEmpresa } from '@/core/infrastructure/api/helpers';
import { logApiError } from '@/core/infrastructure/api/api-logger';

const updateHorasSchema = z.object({
  hora_recogida_inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  hora_recogida_fin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

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
    const result = await getTgtgUseCase().updateHoras(
      empresaId,
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
