import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getAnalyticsUseCase } from '@/core/infrastructure/database';

const uuidSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ turnoId: string }> }
) {
  // Dual-auth: admin token first, then tpv_employee_token (both set x-empresa-id via proxy)
  const { empresaId, error: authError } = (await requireAuth(request)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(request, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { turnoId } = await params;
  const parsed = uuidSchema.safeParse(turnoId);
  if (!parsed.success) {
    return validationErrorResponse('turnoId inválido');
  }

  const result = await getAnalyticsUseCase().getCierreReporte(parsed.data);
  return handleResult(result);
}
