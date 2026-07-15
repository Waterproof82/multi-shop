import { type NextRequest } from 'next/server';
import { getComplementoGrupoUseCase } from '@/core/infrastructure/database';
import { updateComplementoOpcionSchema } from '@/core/application/dtos/complemento.dto';
import { resolveAdminContext, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

interface Params {
  params: Promise<{ grupoId: string; opcionId: string }>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;

  const { grupoId, opcionId } = await params;

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

  const result = await getComplementoGrupoUseCase().updateOpcion(opcionId, grupoId, {
    nombre_es: parsed.data.nombre_es,
    precioAdicional: parsed.data.precio_adicional,
    orden: parsed.data.orden,
  });
  return handleResultWithStatus(result);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;

  const { grupoId, opcionId } = await params;

  const result = await getComplementoGrupoUseCase().deleteOpcion(opcionId, grupoId);
  return handleResultWithStatus(result);
}
