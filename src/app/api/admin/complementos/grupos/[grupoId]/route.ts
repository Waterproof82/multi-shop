import { type NextRequest } from 'next/server';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { updateComplementoGrupoSchema } from '@/core/application/dtos/complemento.dto';
import { requireAuth, requireRole, handleResultWithStatus, validationErrorResponse, type AuthResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

interface Params {
  params: Promise<{ grupoId: string }>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { grupoId } = await params;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const { id: _bodyId, ...updateData } = body as Record<string, unknown>;
  const parsed = updateComplementoGrupoSchema.safeParse(updateData);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await complementoGrupoUseCase.update(grupoId, empresaId!, parsed.data);
  return handleResultWithStatus(result);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { grupoId } = await params;

  const { empresaId: authEmpresaId, error: authError, isSuperAdmin } = await requireAuth(request) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { searchParams } = new URL(request.url);
  const queryEmpresaId = searchParams.get('empresaId');
  const empresaId = (isSuperAdmin && queryEmpresaId) ? queryEmpresaId : authEmpresaId;

  const result = await complementoGrupoUseCase.delete(grupoId, empresaId!);
  return handleResultWithStatus(result);
}
