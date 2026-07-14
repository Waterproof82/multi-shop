import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  resolveAdminContext,
  validationErrorResponse,
} from '@/core/infrastructure/api/helpers';
import { SupabaseStockRepository } from '@/core/infrastructure/repositories/supabase-stock.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { TipoMovimiento } from '@/core/domain/entities/stock-types';

const VALID_TIPOS: TipoMovimiento[] = ['entrada', 'deduccion', 'ajuste', 'merma', 'sin_receta'];

function parseTipo(value: string | null): TipoMovimiento | undefined {
  if (!value) return undefined;
  if ((VALID_TIPOS as string[]).includes(value)) return value as TipoMovimiento;
  return undefined;
}

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  ingredienteId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

async function countMovimientos(
  empresaId: string,
  opts: {
    ingredienteId?: string;
    tipo?: TipoMovimiento;
    startDate?: string;
    endDate?: string;
  }
): Promise<number> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('movimientos_stock')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);

  if (opts.ingredienteId) query = query.eq('ingrediente_id', opts.ingredienteId);
  if (opts.tipo) query = query.eq('tipo', opts.tipo);
  if (opts.startDate) query = query.gte('created_at', opts.startDate);
  if (opts.endDate) query = query.lte('created_at', opts.endDate);

  const { count } = await query;
  return count ?? 0;
}

export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(req);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    ingredienteId: searchParams.get('ingredienteId') ?? undefined,
    startDate: searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('endDate') ?? undefined,
  });

  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const { page, limit, ingredienteId, startDate, endDate } = parsed.data;
  const tipo = parseTipo(searchParams.get('tipo'));

  const repo = new SupabaseStockRepository();
  const [itemsResult, total] = await Promise.all([
    repo.findMovimientos(empresaId, { page, limit, ingredienteId, tipo, startDate, endDate }),
    countMovimientos(empresaId, { ingredienteId, tipo, startDate, endDate }),
  ]);

  if (!itemsResult.success) {
    return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ items: itemsResult.data, total, page, limit });
}
