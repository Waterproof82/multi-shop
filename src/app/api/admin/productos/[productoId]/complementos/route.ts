import { type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { setProductoGruposSchema } from '@/core/application/dtos/complemento.dto';
import { requireAuth, requireRole, handleResultWithStatus, validationErrorResponse, type AuthResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { catalogTag } from '@/lib/cache-tags';

interface Params {
  params: Promise<{ productoId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { productoId } = await params;
  const { empresaId: authEmpresaId, error: authError } = await requireAuth(request) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  if (!authEmpresaId) return validationErrorResponse('empresaId requerido');

  const result = await complementoGrupoUseCase.getByProducto(productoId, authEmpresaId);
  return handleResultWithStatus(result);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { productoId } = await params;
  const { empresaId: authEmpresaId, error: authError } = await requireAuth(request) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  if (!authEmpresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = setProductoGruposSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const result = await complementoGrupoUseCase.setProductoGrupos(productoId, parsed.data.grupoIds, authEmpresaId);
  if (result.success) revalidateTag(catalogTag(authEmpresaId!), {});
  return handleResultWithStatus(result);
}
