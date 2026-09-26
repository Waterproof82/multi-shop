import { NextRequest } from 'next/server';
import { getSuperAdminUseCase } from '@/core/infrastructure/database';
import { requireRole, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';

interface RouteParams {
  params: Promise<{ empresaId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const roleError = requireRole(request, ['superadmin']);
  if (roleError) return roleError;

  const { empresaId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const result = await getSuperAdminUseCase().updateEmpresa(empresaId, body as Record<string, unknown>);
  return handleResult(result);
}
