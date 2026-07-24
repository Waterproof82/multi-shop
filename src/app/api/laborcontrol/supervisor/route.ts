import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, requireRole, handleResult } from '@/core/infrastructure/api/helpers';
import { getLcObtenerEstadoSupervisorUseCase } from '@/core/laborcontrol/infrastructure';

// GET /api/laborcontrol/supervisor
// Auth: requireRole admin | encargado
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const forbidden = requireRole(req, ['admin', 'encargado', 'superadmin']);
  if (forbidden) return forbidden;

  const uc = getLcObtenerEstadoSupervisorUseCase();
  const result = await uc.execute(ctx.empresaId);
  return handleResult(result);
}
