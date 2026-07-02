import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  handleResultWithStatus,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { abrirTurnoUseCase } from '@/core/application/use-cases/tpv/abrir-turno.use-case';
import { z } from 'zod';

const repo = new SupabaseTpvRepository();

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['admin', 'superadmin']);
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

  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

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
    operadorNombre: parsed.data.operadorNombre,
    efectivoAperturaCents: parsed.data.efectivoAperturaCents,
  });

  return handleResultWithStatus(result, 201);
}
