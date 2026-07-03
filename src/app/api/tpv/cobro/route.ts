import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { registrarCobroUseCase } from '@/core/application/use-cases/tpv/registrar-cobro.use-case';
import { z } from 'zod';

const CobroSchema = z.object({
  sesionId: z.string().uuid(),
  metodoPago: z.enum(['efectivo', 'tarjeta']),
  importeCobradoCents: z.number().int().positive(),
  propinaCents: z.number().int().min(0),
  turnoId: z.string().uuid(),
  ivaPorcentaje: z.number().min(0).max(30).optional().default(10),
});

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CobroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const repo = new SupabaseTpvRepository();
  const result = await registrarCobroUseCase(repo, { ...parsed.data, empresaId });
  return handleResult(result);
}
