import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationErrorResponse, handleResult } from '@/core/infrastructure/api/helpers';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { empresaPublicRepository } from '@/core/infrastructure/database';
import { initiateRedsysPaymentUseCase } from '@/core/application/use-cases/payment/initiateRedsysPaymentUseCase';

const initiateSchema = z.object({
  pedidoId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain);
  const empresaResult = await empresaPublicRepository.findByDomain(mainDomain);
  if (!empresaResult.success || !empresaResult.data) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = initiateSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const origin = request.nextUrl.origin;

  const result = await initiateRedsysPaymentUseCase({
    pedidoId: parsed.data.pedidoId,
    empresaId: empresaResult.data.id,
    urlOk: `${origin}/pedido/pago-ok`,
    urlKo: `${origin}/pedido/pago-ko`,
    webhookUrl: `${origin}/api/redsys/webhook`,
  });

  return handleResult(result);
}
