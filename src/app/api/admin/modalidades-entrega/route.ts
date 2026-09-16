import { NextRequest } from 'next/server';
import { getModalidadEntregaUseCase } from '@/core/infrastructure/database';
import { createModalidadEntregaSchema, updateModalidadEntregaSchema, modalidadEntregaIdSchema } from '@/core/application/dtos/modalidad-entrega.dto';
import { resolveAdminContextWithEmpresa, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getModalidadEntregaUseCase().getAll(empresaId);
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
  const parsed = createModalidadEntregaSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0].message);
  }

  const result = await getModalidadEntregaUseCase().create(parsed.data);

  if (!result.success) {
    return handleResult(result);
  }

  return handleResultWithStatus({ success: true, data: result.data }, 201);
}

export async function PUT(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = modalidadEntregaIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const { id: _bodyId, ...updateData } = body as Record<string, unknown>;

  if ('tipo' in updateData) {
    return validationErrorResponse('No se puede cambiar el tipo de una modalidad de entrega existente. Borrala y creá una nueva.');
  }

  const parsed = updateModalidadEntregaSchema.safeParse(updateData);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0].message);
  }

  const result = await getModalidadEntregaUseCase().update(idParsed.data.id, empresaId, parsed.data);

  if (!result.success) {
    return handleResult(result);
  }

  return handleResult({ success: true, data: result.data });
}

export async function DELETE(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const idParsed = modalidadEntregaIdSchema.safeParse({ id: idParam });

  if (!idParsed.success) {
    return validationErrorResponse('ID inválido');
  }

  const result = await getModalidadEntregaUseCase().delete(idParsed.data.id, empresaId);

  if (!result.success) {
    return handleResult(result);
  }

  return handleResult({ success: true, data: { success: true } });
}
