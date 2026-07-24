import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminContextWithEmpresa, requireRole, handleResult } from '@/core/infrastructure/api/helpers';
import { getLcVerificarCadenaUseCase } from '@/core/laborcontrol/infrastructure';
import { z } from 'zod';

const QuerySchema = z.object({
  year:  z.coerce.number().int().min(2026).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

// GET /api/laborcontrol/chain/verify?year=YYYY&month=M
// Auth: requireRole admin
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  const actorId = req.headers.get('x-admin-id');
  if (!actorId) return NextResponse.json({ error: 'actorId no resuelto' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const parsed = QuerySchema.safeParse({
    year:  sp.get('year'),
    month: sp.get('month'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros year/month requeridos' }, { status: 400 });
  }

  const uc = getLcVerificarCadenaUseCase();
  const result = await uc.execute(ctx.empresaId, parsed.data.year, parsed.data.month, actorId);
  return handleResult(result);
}
