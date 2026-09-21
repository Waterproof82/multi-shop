import { type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getMenuVirtualUseCase } from '@/core/infrastructure/database';
import { setMenuVirtualProductosSchema } from '@/core/application/dtos/menu-virtual.dto';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { catalogTag } from '@/lib/cache-tags';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { id } = await params;

  const result = await getMenuVirtualUseCase().getProductoIds(id, empresaId);
  return handleResultWithStatus(result);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = setMenuVirtualProductosSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  }

  const result = await getMenuVirtualUseCase().setProductos(id, parsed.data.productoIds, empresaId);
  if (result.success) revalidateTag(catalogTag(empresaId), {});
  return handleResultWithStatus(result);
}
