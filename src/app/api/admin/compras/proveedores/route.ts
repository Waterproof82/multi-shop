import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { createProveedorUseCase } from '@/core/application/use-cases/compras/proveedor/createProveedor.use-case';

export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const result = await getComprasRepository().findProveedores(ctx.empresaId);
  return handleResult(result);
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const result = await createProveedorUseCase(getComprasRepository(), ctx.empresaId, body);
  return handleResultWithStatus(result, 201);
}
