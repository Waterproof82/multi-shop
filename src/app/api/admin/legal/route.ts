import { NextRequest } from 'next/server';
import { getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import { updateEmpresaLegalSchema } from '@/core/application/dtos/empresa-legal.dto';
import { resolveAdminContextWithEmpresa, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  return handleResult(await getEmpresaLegalUseCase().get(ctx.empresaId));
}

export async function PUT(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = updateEmpresaLegalSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.issues[0].message);

  return handleResult(await getEmpresaLegalUseCase().update(ctx.empresaId, parsed.data));
}
