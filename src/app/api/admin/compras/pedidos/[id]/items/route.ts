import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { addItemToPedidoUseCase } from '@/core/application/use-cases/compras/pedido/addItemToPedido.use-case';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const { id } = await params;
  const result = await addItemToPedidoUseCase(getComprasRepository(), ctx.empresaId, { ...(body as object), pedidoId: id });
  return handleResultWithStatus(result, 201);
}
