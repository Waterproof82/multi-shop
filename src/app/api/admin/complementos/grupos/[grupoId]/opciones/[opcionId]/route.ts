import { type NextRequest } from 'next/server';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { updateComplementoOpcionSchema } from '@/core/application/dtos/complemento.dto';
import { requireAuth, requireRole, handleResultWithStatus, validationErrorResponse, type AuthResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

interface Params {
  params: Promise<{ grupoId: string; opcionId: string }>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { grupoId, opcionId } = await params;
  const { error: authError } = await requireAuth(request) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = updateComplementoOpcionSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const result = await complementoGrupoUseCase.updateOpcion(opcionId, grupoId, {
    nombre_es: parsed.data.nombre_es,
    precioAdicional: parsed.data.precio_adicional,
    orden: parsed.data.orden,
  });
  return handleResultWithStatus(result);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { grupoId, opcionId } = await params;
  const { error: authError } = await requireAuth(request) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const result = await complementoGrupoUseCase.deleteOpcion(opcionId, grupoId);
  return handleResultWithStatus(result);
}
