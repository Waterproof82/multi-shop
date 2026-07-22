import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getClienteRepository } from '@/core/infrastructure/database';
import { exportarClienteUseCase } from '@/core/application/use-cases/rgpd/exportar-cliente.use-case';
import { z } from 'zod';

const QuerySchema = z.object({
  clienteId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 401 });

  const parsed = QuerySchema.safeParse({
    clienteId: req.nextUrl.searchParams.get('clienteId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'clienteId inválido' }, { status: 400 });
  }

  const repo = getClienteRepository();
  const result = await exportarClienteUseCase(repo, parsed.data.clienteId, empresaId);

  if (!result.success) {
    const status = result.error.code === 'NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  const filename = `rgpd-cliente-${parsed.data.clienteId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(result.data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
