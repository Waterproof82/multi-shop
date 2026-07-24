import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminContextWithEmpresa, requireRole, handleResult } from '@/core/infrastructure/api/helpers';
import { getLcGestionarHoldUseCase } from '@/core/laborcontrol/infrastructure';
import { z } from 'zod';

const CreateHoldSchema = z.object({
  empleadoId:  z.string().uuid().optional(),
  fechaInicio: z.string().date(),
  fechaFin:    z.string().date(),
  motivo:      z.string().min(1).max(500),
});

// GET /api/laborcontrol/holds — list active holds
// POST /api/laborcontrol/holds — create hold
// Auth: requireRole admin
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  const uc = getLcGestionarHoldUseCase();
  const result = await uc.listar(ctx.empresaId);
  return handleResult(result);
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  const actorId = req.headers.get('x-admin-id');
  if (!actorId) return NextResponse.json({ error: 'actorId no resuelto' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = CreateHoldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const uc = getLcGestionarHoldUseCase();
  const result = await uc.crear({
    empresaId:   ctx.empresaId,
    actorId,
    empleadoId:  parsed.data.empleadoId,
    fechaInicio: parsed.data.fechaInicio,
    fechaFin:    parsed.data.fechaFin,
    motivo:      parsed.data.motivo,
  });

  return handleResult(result);
}
