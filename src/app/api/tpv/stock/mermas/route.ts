import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResultWithStatus,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getStockRepository } from '@/core/infrastructure/database';
import { registrarMermaUseCase } from '@/core/application/use-cases/stock/registrar-merma.use-case';
import { z } from 'zod';

const MermaSchema = z.object({
  ingredienteId: z.string().uuid(),
  cantidad: z.number().positive(),
  motivo: z.enum(['caducidad', 'rotura', 'error_preparacion', 'otro']),
  turnoId: z.string().uuid().nullable(),
  operadorNombre: z.string().min(1).max(100),
  notas: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = MermaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const repo = getStockRepository();
  const result = await registrarMermaUseCase(repo, { ...parsed.data, empresaId });
  return handleResultWithStatus(result, 201);
}
