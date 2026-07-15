import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { cancelPedidoUseCase } from '@/core/application/use-cases/compras/pedido/cancelPedido.use-case';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await cancelPedidoUseCase(getComprasRepository(), ctx.empresaId, id);
  return handleResult(result);
}
