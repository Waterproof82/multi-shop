import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { updateProveedorUseCase } from '@/core/application/use-cases/compras/proveedor/updateProveedor.use-case';
import { deleteProveedorUseCase } from '@/core/application/use-cases/compras/proveedor/deleteProveedor.use-case';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await getComprasRepository().findProveedorById(ctx.empresaId, id);
  return handleResult(result);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const { id } = await params;
  const result = await updateProveedorUseCase(getComprasRepository(), ctx.empresaId, id, body);
  return handleResult(result);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await deleteProveedorUseCase(getComprasRepository(), ctx.empresaId, id);
  return handleResult(result);
}
