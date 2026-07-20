import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  resolveAdminContext,
  handleResult,
  validationErrorResponse,
} from '@/core/infrastructure/api/helpers';
import { getStockRepository, getAuditLogRepository } from '@/core/infrastructure/database';
import { ajustarStockUseCase } from '@/core/application/use-cases/stock/ajustar-stock.use-case';
import { resolveActor } from '@/core/infrastructure/api/audit-actor';

const ajusteSchema = z.object({
  delta: z.number().refine((v) => v !== 0, { message: 'El delta no puede ser cero' }),
  tipo: z.enum(['entrada', 'ajuste']).default('ajuste'),
  turnoId: z.string().uuid().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const authCtx = await resolveAdminContext(req);
  if (authCtx.error) return authCtx.error;
  const { empresaId } = authCtx;
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

  const repo = getStockRepository();
  const result = await ajustarStockUseCase(repo, {
    empresaId,
    ingredienteId,
    delta: parsed.data.delta,
    tipo: parsed.data.tipo,
    turnoId: parsed.data.turnoId,
  });

  if (result.success) {
    const actor = resolveActor(req);
    void getAuditLogRepository().insert({
      empresaId,
      action: 'admin.stock.ajuste',
      payload: { ingredienteId, delta: parsed.data.delta },
      ...actor,
    });
  }

  return handleResult(result);
}
