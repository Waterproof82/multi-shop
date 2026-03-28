import { NextRequest } from 'next/server';
import { superAdminUseCase } from '@/core/infrastructure/database';
import { handleResult, errorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const adminRol = request.headers.get('x-admin-rol');
  if (adminRol !== 'superadmin') {
    return errorResponse('Acceso denegado', 403);
  }

  const result = await superAdminUseCase.getAllEmpresas();

  if (!result.success) {
    return handleResult(result);
  }

  return handleResult({ success: true, data: result.data });
}
