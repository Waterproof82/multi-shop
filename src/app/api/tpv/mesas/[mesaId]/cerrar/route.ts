import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { mesaSesionRepository } from '@/core/infrastructure/database';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const { mesaId } = await params;

  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(mesaId);
  if (!sesionResult.success) return handleResult(sesionResult);
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'Sin sesión activa' }, { status: 404 });
  }

  const sesion = sesionResult.data;
  if (!sesion.sesionPagada) {
    return NextResponse.json({ error: 'La sesión no está pagada' }, { status: 422 });
  }

  const closeResult = await mesaSesionRepository.closeSesion(sesion.id);
  if (!closeResult.success) {
    return NextResponse.json({ error: closeResult.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
