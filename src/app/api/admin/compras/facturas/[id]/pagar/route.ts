import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { registrarPagoFacturaUseCase } from '@/core/application/use-cases/compras/factura/registrarPagoFactura.use-case';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const { id } = await params;
  const result = await registrarPagoFacturaUseCase(getComprasRepository(), ctx.empresaId, id, body);
  return handleResult(result);
}
