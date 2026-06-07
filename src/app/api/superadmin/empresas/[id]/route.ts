import { NextRequest } from 'next/server';
import { superAdminUseCase } from '@/core/infrastructure/database';
import { requireRole, handleResult, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { updateEmpresaSchema } from '@/core/application/dtos/empresa.dto';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const roleError = requireRole(request, ['superadmin']);
  if (roleError) return roleError;

  const { id } = await params;
  const result = await superAdminUseCase.getEmpresaById(id);

  if (!result.success) {
    return handleResult(result);
  }

  if (!result.data) {
    return errorResponse('Empresa no encontrada', 404);
  }

  return handleResult({ success: true, data: result.data });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const roleError = requireRole(request, ['superadmin']);
  if (roleError) return roleError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = updateEmpresaSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await superAdminUseCase.updateEmpresa(id, parsed.data);

  if (!result.success) {
    return handleResult(result);
  }

  return handleResult({ success: true, data: { success: true } });
}
