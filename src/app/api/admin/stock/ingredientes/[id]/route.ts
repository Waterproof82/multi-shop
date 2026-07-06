import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseStockRepository } from '@/core/infrastructure/repositories/supabase-stock.repository';

const updateIngredienteSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  unidad: z.enum(['kg', 'l', 'ud']).optional(),
  umbralAlerta: z.number().min(0).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(req, ['admin', 'superadmin']);
  if (roleError) return roleError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id } = await ctx.params;
  const repo = new SupabaseStockRepository();
  const result = await repo.findIngredienteById(id);

  if (!result.success) {
    const status = result.error.code === 'STOCK_INGREDIENTE_NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return handleResult(result);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(req, ['admin', 'superadmin']);
  if (roleError) return roleError;
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

  const repo = new SupabaseStockRepository();
  const result = await repo.updateIngrediente(id, parsed.data);
  return handleResult(result);
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(req, ['admin', 'superadmin']);
  if (roleError) return roleError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { id } = await ctx.params;
  const repo = new SupabaseStockRepository();
  const result = await repo.deleteIngrediente(id);

  if (!result.success) {
    return handleResult(result);
  }

  return new NextResponse(null, { status: 204 });
}
