import { NextRequest } from 'next/server';
import {
  requireAuth,
  handleResult,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { getStockRepository } from '@/core/infrastructure/database';
import { getLowStockAlertsUseCase } from '@/core/application/use-cases/stock/get-low-stock-alerts.use-case';

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const repo = getStockRepository();
  const result = await getLowStockAlertsUseCase(repo, empresaId);

  if (!result.success) {
    return handleResult(result);
  }

  return handleResult({ success: true, data: { alerts: result.data } });
}
