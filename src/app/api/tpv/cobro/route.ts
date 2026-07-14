import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getTpvRepository } from '@/core/infrastructure/database';
import { registrarCobroUseCase } from '@/core/application/use-cases/tpv/registrar-cobro.use-case';
import { z } from 'zod';

const CobroSchema = z.object({
  sesionId: z.string().uuid(),
  metodoPago: z.enum(['efectivo', 'tarjeta']),
  importeCobradoCents: z.number().int().positive(),
  propinaCents: z.number().int().min(0),
  descuentoCents: z.number().int().min(0).optional().default(0),
  turnoId: z.string().uuid(),
  ivaPorcentaje: z.number().min(0).max(30).optional().default(10),
  cerrarSesion: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

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

  const repo = getTpvRepository();
  const result = await registrarCobroUseCase(repo, { ...parsed.data, empresaId, cerrarSesion: parsed.data.cerrarSesion });
  return handleResult(result);
}
