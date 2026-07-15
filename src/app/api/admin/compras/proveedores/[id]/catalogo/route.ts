import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { createCatalogoItemUseCase } from '@/core/application/use-cases/compras/catalogo/createCatalogoItem.use-case';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await getComprasRepository().findCatalogoByProveedor(ctx.empresaId, id);
  return handleResult(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const { id } = await params;
  const result = await createCatalogoItemUseCase(getComprasRepository(), ctx.empresaId, { ...(body as object), proveedorId: id });
  return handleResultWithStatus(result, 201);
}
