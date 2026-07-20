import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  resolveAdminContextWithEmpresa,
  handleResult,
  validationErrorResponse,
} from '@/core/infrastructure/api/helpers';
import { getAnalyticsUseCase } from '@/core/infrastructure/database';

function isValidDate(s: string): boolean {
  return !Number.isNaN(Date.parse(s));
}

const querySchema = z
  .object({
    desdeA: z.string().min(1).max(30),
    hastaA: z.string().min(1).max(30),
    desdeB: z.string().min(1).max(30),
    hastaB: z.string().min(1).max(30),
  })
  .refine(
    ({ desdeA, hastaA, desdeB, hastaB }) =>
      isValidDate(desdeA) && isValidDate(hastaA) && isValidDate(desdeB) && isValidDate(hastaB),
    { message: 'Formato de fecha inválido' }
  )
  .refine(
    ({ desdeA, hastaA }) => Date.parse(desdeA) <= Date.parse(hastaA),
    { message: 'Periodo A: desde debe ser anterior o igual a hasta' }
  )
  .refine(
    ({ desdeB, hastaB }) => Date.parse(desdeB) <= Date.parse(hastaB),
    { message: 'Periodo B: desde debe ser anterior o igual a hasta' }
  );

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const { searchParams } = new URL(request.url);
  const raw = {
    desdeA: searchParams.get('desdeA') ?? '',
    hastaA: searchParams.get('hastaA') ?? '',
    desdeB: searchParams.get('desdeB') ?? '',
    hastaB: searchParams.get('hastaB') ?? '',
  };

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await getAnalyticsUseCase().getComparativa({
    empresaId: ctx.empresaId,
    periodoA: { desde: parsed.data.desdeA, hasta: parsed.data.hastaA },
    periodoB: { desde: parsed.data.desdeB, hasta: parsed.data.hastaB },
  });

  return handleResult(result);
}
