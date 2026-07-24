import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminContextWithEmpresa, requireRole, handleResult } from '@/core/infrastructure/api/helpers';
import { getLcRegistrarCorreccionUseCase } from '@/core/laborcontrol/infrastructure';
import { CorreccionBodySchema } from '@/core/laborcontrol/application/dtos/correccion.dto';

// POST /api/laborcontrol/correcciones
// Auth: requireRole admin | encargado
export async function POST(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'encargado', 'superadmin']);
  if (forbidden) return forbidden;

  const actorId = req.headers.get('x-admin-id') ?? req.headers.get('x-employee-id');
  if (!actorId) return NextResponse.json({ error: 'actorId no resuelto' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = CorreccionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const uc = getLcRegistrarCorreccionUseCase();
  const result = await uc.execute({
    empresaId:       ctx.empresaId,
    centroId:        parsed.data.centroId,
    empleadoId:      parsed.data.empleadoId,
    actorId,
    refCorreccion:   parsed.data.refCorreccion,
    accion:          parsed.data.accion,
    timestampEvento: parsed.data.timestampEvento ? new Date(parsed.data.timestampEvento) : undefined,
    motivo:          parsed.data.motivo,
  });

  return handleResult(result);
}
