import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getClienteRepository } from '@/core/infrastructure/database';
import { anonimizarClienteUseCase } from '@/core/application/use-cases/rgpd/anonimizar-cliente.use-case';
import { z } from 'zod';

const AnonimizarSchema = z.object({
  clienteId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AnonimizarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const repo = getClienteRepository();
  const result = await anonimizarClienteUseCase(repo, parsed.data.clienteId, empresaId);

  return handleResult(result);
}
