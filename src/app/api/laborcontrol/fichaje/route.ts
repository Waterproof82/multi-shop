import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, handleResult } from '@/core/infrastructure/api/helpers';
import { getLcRegistrarFichajeUseCase } from '@/core/laborcontrol/infrastructure';
import { FichajeBodySchema } from '@/core/laborcontrol/application/dtos/fichaje.dto';

// POST /api/laborcontrol/fichaje
// Auth: tpv_employee_token (cajero, encargado) or admin session
export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  const empleadoId = req.headers.get('x-employee-id');
  if (!empleadoId) {
    return NextResponse.json({ error: 'Sesión de empleado requerida' }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = FichajeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Employee may only file for themselves
  if (parsed.data.empleadoId !== empleadoId) {
    return NextResponse.json({ error: 'Solo puedes fichar por ti mismo' }, { status: 403 });
  }

  const uc = getLcRegistrarFichajeUseCase();
  const result = await uc.execute({
    empresaId,
    centroId:        parsed.data.centroId,
    empleadoId:      parsed.data.empleadoId,
    actorId:         empleadoId,
    tipo:            parsed.data.tipo,
    timestampEvento: new Date(parsed.data.timestampEvento),
    origenOffline:   parsed.data.origenOffline,
    driftSegundos:   parsed.data.driftSegundos,
  });

  return handleResult(result);
}
