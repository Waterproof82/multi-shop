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

const replaceRecetaSchema = z.object({
  items: z.array(
    z.object({
      ingredienteId: z.string().uuid(),
      cantidadNecesaria: z.number().gt(0),
    })
  ),
});

type RouteContext = { params: Promise<{ productoId: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(req, ['admin', 'superadmin']);
  if (roleError) return roleError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { productoId } = await ctx.params;
  const repo = new SupabaseStockRepository();
  const result = await repo.findRecetaByProducto(productoId);
  return handleResult(result);
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(req, ['admin', 'superadmin']);
  if (roleError) return roleError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { productoId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return validationErrorResponse('Cuerpo de la petición inválido');
  }

  const parsed = replaceRecetaSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const repo = new SupabaseStockRepository();
  const result = await repo.replaceReceta(productoId, parsed.data.items);
  return handleResult(result);
}
