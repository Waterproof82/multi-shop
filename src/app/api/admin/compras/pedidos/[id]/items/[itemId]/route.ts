import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { updatePedidoItemUseCase } from '@/core/application/use-cases/compras/pedido/updatePedidoItem.use-case';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('Cuerpo inválido'); }

  const { id, itemId } = await params;
  const result = await updatePedidoItemUseCase(getComprasRepository(), ctx.empresaId, id, itemId, body);
  return handleResult(result);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const { id, itemId } = await params;
  const result = await getComprasRepository().removePedidoItem(ctx.empresaId, id, itemId);
  return handleResult(result);
}
