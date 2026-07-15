import { type NextRequest } from 'next/server';
import { getComplementoGrupoUseCase } from '@/core/infrastructure/database';
import { updateComplementoGrupoSchema } from '@/core/application/dtos/complemento.dto';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

interface Params {
  params: Promise<{ grupoId: string }>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { grupoId } = await params;

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

  const result = await getComplementoGrupoUseCase().update(grupoId, empresaId, parsed.data);
  return handleResultWithStatus(result);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { grupoId } = await params;

  const result = await getComplementoGrupoUseCase().delete(grupoId, empresaId);
  return handleResultWithStatus(result);
}
