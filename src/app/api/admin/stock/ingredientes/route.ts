import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  resolveAdminContext,
  handleResult,
  handleResultWithStatus,
  validationErrorResponse,
} from '@/core/infrastructure/api/helpers';
import { SupabaseStockRepository } from '@/core/infrastructure/repositories/supabase-stock.repository';

const createIngredienteSchema = z.object({
  nombre: z.string().min(1).max(120),
  unidad: z.enum(['kg', 'l', 'ud']),
  cantidadActual: z.number().min(0),
  umbralAlerta: z.number().min(0),
});

export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(req);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const repo = new SupabaseStockRepository();
  const result = await repo.findIngredientes(empresaId);
  return handleResult(result);
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAdminContext(req);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return validationErrorResponse('Cuerpo de la petición inválido');
  }

  const parsed = createIngredienteSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const repo = new SupabaseStockRepository();
  const result = await repo.createIngrediente({ ...parsed.data, empresaId });
  return handleResultWithStatus(result, 201);
}
