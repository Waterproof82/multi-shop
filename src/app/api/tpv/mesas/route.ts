import { type NextRequest, NextResponse } from 'next/server';
import { getMesaSesionUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const result = await getMesaSesionUseCase().getMesasWithSessions(empresaId);
  return NextResponse.json({
    mesas: result.success ? result.data : [],
  });
}
