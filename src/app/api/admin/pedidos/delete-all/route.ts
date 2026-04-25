import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pedidoUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, successResponse, validationErrorResponse, handleResult, type AuthResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

export async function DELETE(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as AuthResult;
  if (authError) return authError;
  
  const roleError = requireRole(request, ['superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  
  if (!queryEmpresaId) {
    return validationErrorResponse('Se requiere empresaId');
  }

  const empresaId = queryEmpresaId;

  const result = await pedidoUseCase.deleteAll(empresaId);
  if (!result.success) {
    return handleResult(result);
  }
  
  return successResponse({ 
    success: true, 
    deletedCount: result.data 
  });
}