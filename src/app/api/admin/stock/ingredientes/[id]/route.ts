import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  resolveAdminContext,
  handleResult,
  validationErrorResponse,
} from '@/core/infrastructure/api/helpers';
import { getStockRepository } from '@/core/infrastructure/database';

const updateIngredienteSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  unidad: z.enum(['kg', 'l', 'ud']).optional(),
  umbralAlerta: z.number().min(0).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const authCtx = await resolveAdminContext(req);
  if (authCtx.error) return authCtx.error;
  const { empresaId } = authCtx;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id } = await ctx.params;
  const repo = getStockRepository();
  const result = await repo.findIngredienteById(id);

  if (!result.success) {
    const status = result.error.code === 'STOCK_INGREDIENTE_NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return handleResult(result);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const authCtx = await resolveAdminContext(req);
  if (authCtx.error) return authCtx.error;
  const { empresaId } = authCtx;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return validationErrorResponse('Cuerpo de la petición inválido');
  }

  const parsed = updateIngredienteSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const repo = getStockRepository();
  const result = await repo.updateIngrediente(id, parsed.data);
  return handleResult(result);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const authCtx = await resolveAdminContext(req);
  if (authCtx.error) return authCtx.error;
  const { empresaId } = authCtx;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id } = await ctx.params;
  const repo = getStockRepository();
  const result = await repo.deleteIngrediente(id);

  if (!result.success) {
    return handleResult(result);
  }

  return new NextResponse(null, { status: 204 });
}
