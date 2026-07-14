import { type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getComplementoGrupoUseCase } from '@/core/infrastructure/database';
import { setProductoGruposSchema } from '@/core/application/dtos/complemento.dto';
import { resolveAdminContext, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { catalogTag } from '@/lib/cache-tags';

interface Params {
  params: Promise<{ productoId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { productoId } = await params;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const result = await getComplementoGrupoUseCase().getByProducto(productoId, empresaId);
  return handleResultWithStatus(result);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContext(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { productoId } = await params;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

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

  const result = await getComplementoGrupoUseCase().setProductoGrupos(productoId, parsed.data.grupoIds, empresaId);
  if (result.success) revalidateTag(catalogTag(empresaId!), {});
  return handleResultWithStatus(result);
}
