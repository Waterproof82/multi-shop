import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  resolveAdminContextWithEmpresa,
  handleResult,
  validationErrorResponse,
} from '@/core/infrastructure/api/helpers';
import { getAnalyticsUseCase } from '@/core/infrastructure/database';

const querySchema = z
  .object({
    desde: z.string().min(1).max(30),
    hasta: z.string().min(1).max(30),
  })
  .refine(
    ({ desde, hasta }) => !Number.isNaN(Date.parse(desde)) && !Number.isNaN(Date.parse(hasta)),
    { message: 'Formato de fecha inválido para desde o hasta' }
  )
  .refine(
    ({ desde, hasta }) => {
      const diffDays = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
      return diffDays >= 0 && diffDays <= 90;
    },
    { message: 'El rango debe ser positivo y no superar 90 días' }
  );

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const { searchParams } = new URL(request.url);
  const raw = {
    desde: searchParams.get('desde') ?? '',
    hasta: searchParams.get('hasta') ?? '',
  };

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await getAnalyticsUseCase().getOcupacionHeatmap({
    empresaId: ctx.empresaId,
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
  });

  return handleResult(result);
}
