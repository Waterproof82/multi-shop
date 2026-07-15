import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { createAlbaranUseCase } from '@/core/application/use-cases/compras/albaran/createAlbaran.use-case';

export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const q = new URL(req.url).searchParams;
  const result = await getComprasRepository().findAlbaranes(ctx.empresaId, {
    estado: q.get('estado') ?? undefined,
    proveedorId: q.get('proveedor_id') ?? undefined,
    fechaDesde: q.get('fecha_desde') ?? undefined,
    fechaHasta: q.get('fecha_hasta') ?? undefined,
  });
  return handleResult(result);
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const result = await createAlbaranUseCase(getComprasRepository(), ctx.empresaId, body);
  return handleResultWithStatus(result, 201);
}
