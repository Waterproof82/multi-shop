import { NextRequest } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseStockRepository } from '@/core/infrastructure/repositories/supabase-stock.repository';

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const roleError = requireRole(req, ['admin', 'superadmin']);
  if (roleError) return roleError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const { searchParams } = new URL(req.url);
  const turnoId = searchParams.get('turnoId') ?? undefined;

  const repo = new SupabaseStockRepository();
  const result = await repo.findMermas(empresaId, turnoId);
  return handleResult(result);
}
