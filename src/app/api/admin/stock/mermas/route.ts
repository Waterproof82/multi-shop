import { NextRequest } from 'next/server';
import {
  resolveAdminContext,
  handleResult,
  validationErrorResponse,
} from '@/core/infrastructure/api/helpers';
import { SupabaseStockRepository } from '@/core/infrastructure/repositories/supabase-stock.repository';

export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(req);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { searchParams } = new URL(req.url);
  const turnoId = searchParams.get('turnoId') ?? undefined;

  const repo = new SupabaseStockRepository();
  const result = await repo.findMermas(empresaId, turnoId);
  return handleResult(result);
}
