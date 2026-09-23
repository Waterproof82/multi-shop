import { NextRequest } from 'next/server';
import { getTablaPlantillaUseCase } from '@/core/infrastructure/database';
import { createTablaPlantillaSchema, tablaPlantillaIdSchema } from '@/core/application/dtos/tabla-plantilla.dto';
import { resolveAdminContextWithEmpresa, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getTablaPlantillaUseCase().getAll(empresaId);
  return handleResult(result);
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = createTablaPlantillaSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0].message);
  }

  const result = await getTablaPlantillaUseCase().create(parsed.data);

  if (!result.success) {
    return handleResult(result);
  }

  return handleResultWithStatus({ success: true, data: result.data }, 201);
}

export async function DELETE(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = tablaPlantillaIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  const result = await getTablaPlantillaUseCase().delete(idParsed.data.id, empresaId);

  if (!result.success) {
    return handleResult(result);
  }

  return handleResult({ success: true, data: { success: true } });
}
