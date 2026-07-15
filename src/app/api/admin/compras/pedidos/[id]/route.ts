import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  const { id } = await params;
  const result = await getComprasRepository().findPedidoById(ctx.empresaId, id);
  return handleResult(result);
}
