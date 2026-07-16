import { NextRequest } from 'next/server';
import {
  resolveAdminContextWithEmpresa,
  handleResult,
  validationErrorResponse,
} from '@/core/infrastructure/api/helpers';
import { getAnalyticsUseCase } from '@/core/infrastructure/database';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');

  if (!desde || !hasta) {
    return validationErrorResponse('Missing required params: desde, hasta');
  }

  if (isNaN(Date.parse(desde)) || isNaN(Date.parse(hasta))) {
    return validationErrorResponse('Invalid date format for desde or hasta');
  }

  const result = await getAnalyticsUseCase().getMargenProductos({
    empresaId: ctx.empresaId,
    desde,
    hasta,
  });

  return handleResult(result);
}
