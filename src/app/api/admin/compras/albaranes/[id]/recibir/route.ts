import { NextRequest } from 'next/server';
import { resolveAdminContextWithEmpresa, handleResult } from '@/core/infrastructure/api/helpers';
import { getComprasRepository } from '@/core/infrastructure/database';
import { marcarAlbaranRecibidoUseCase } from '@/core/application/use-cases/compras/albaran/marcarAlbaranRecibido.use-case';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await resolveAdminContextWithEmpresa(req);
  if (ctx.error) return ctx.error;

  // Proxy injects x-admin-id from the JWT payload adminId field
  const empleadoId = req.headers.get('x-admin-id') ?? 'admin';

  const { id } = await params;
  const result = await marcarAlbaranRecibidoUseCase(getComprasRepository(), ctx.empresaId, id, empleadoId);
  return handleResult(result);
}
