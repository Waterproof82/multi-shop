import { type NextRequest } from 'next/server';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { createComplementoOpcionSchema } from '@/core/application/dtos/complemento.dto';
import { requireAuth, requireRole, handleResultWithStatus, validationErrorResponse, type AuthResult } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

interface Params {
  params: Promise<{ grupoId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { grupoId } = await params;
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

  const parsed = createComplementoOpcionSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const result = await complementoGrupoUseCase.createOpcion({
    grupoId,
    empresaId: authEmpresaId,
    nombre_es: parsed.data.nombre_es,
    nombre_en: parsed.data.nombre_en,
    nombre_fr: parsed.data.nombre_fr,
    nombre_it: parsed.data.nombre_it,
    nombre_de: parsed.data.nombre_de,
    precioAdicional: parsed.data.precio_adicional,
    orden: parsed.data.orden,
  });
  return handleResultWithStatus(result, 201);
}
