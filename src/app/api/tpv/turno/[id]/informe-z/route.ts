import { NextRequest } from 'next/server';
import {
  requireAuth,
  requireRole,
  validationErrorResponse,
  handleResult,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository } from '@/core/infrastructure/database';

const repo = getTpvRepository();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id } = await params;
  const result = await repo.getInformeZ(id, empresaId);
  return handleResult(result);
}
