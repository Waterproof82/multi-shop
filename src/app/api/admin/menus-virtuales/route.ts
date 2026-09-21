import { type NextRequest } from 'next/server';
import { getMenuVirtualUseCase } from '@/core/infrastructure/database';
import { createMenuVirtualSchema } from '@/core/application/dtos/menu-virtual.dto';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getMenuVirtualUseCase().getAll(empresaId);
  return handleResultWithStatus(result);
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = createMenuVirtualSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0].message);
  }

  const result = await getMenuVirtualUseCase().create(parsed.data);
  return handleResultWithStatus(result, 201);
}
