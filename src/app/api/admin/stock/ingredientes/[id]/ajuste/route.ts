import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseStockRepository } from '@/core/infrastructure/repositories/supabase-stock.repository';
import { ajustarStockUseCase } from '@/core/application/use-cases/stock/ajustar-stock.use-case';

const ajusteSchema = z.object({
  delta: z.number().refine((v) => v !== 0, { message: 'El delta no puede ser cero' }),
  tipo: z.enum(['entrada', 'ajuste']).default('ajuste'),
  turnoId: z.string().uuid().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(req, ['admin', 'superadmin']);
  if (roleError) return roleError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id: ingredienteId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return validationErrorResponse('Cuerpo de la petición inválido');
  }

  const parsed = ajusteSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const repo = new SupabaseStockRepository();
  const result = await ajustarStockUseCase(repo, {
    empresaId,
    ingredienteId,
    delta: parsed.data.delta,
    tipo: parsed.data.tipo,
    turnoId: parsed.data.turnoId,
  });

  return handleResult(result);
}
