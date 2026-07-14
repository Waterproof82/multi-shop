import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  handleResultWithStatus,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository } from '@/core/infrastructure/database';
import { abrirTurnoUseCase } from '@/core/application/use-cases/tpv/abrir-turno.use-case';
import { z } from 'zod';

const repo = getTpvRepository();

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const result = await repo.findTurnoActivo(empresaId);
  return handleResult(result);
}

const AbrirSchema = z.object({
  operadorNombre: z.string().min(2).max(100),
  efectivoAperturaCents: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const userId = req.headers.get('x-admin-id') || null;
  const operadorId = req.headers.get('x-employee-id') || null;

  if (!userId && !operadorId) return validationErrorResponse('usuario requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AbrirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await abrirTurnoUseCase(repo, {
    empresaId,
    userId: userId ?? undefined,
    operadorId: operadorId ?? undefined,
    operadorNombre: parsed.data.operadorNombre,
    efectivoAperturaCents: parsed.data.efectivoAperturaCents,
  });

  return handleResultWithStatus(result, 201);
}
