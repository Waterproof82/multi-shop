import { type NextRequest } from 'next/server';
import { getComplementoGrupoUseCase } from '@/core/infrastructure/database';
import { createComplementoGrupoSchema } from '@/core/application/dtos/complemento.dto';
import { resolveAdminContext, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getComplementoGrupoUseCase().getAll(empresaId!);
  return handleResultWithStatus(result);
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = createComplementoGrupoSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await getComplementoGrupoUseCase().create(parsed.data);
  return handleResultWithStatus(result, 201);
}
