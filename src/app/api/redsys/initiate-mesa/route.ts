import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationErrorResponse, handleResult } from '@/core/infrastructure/api/helpers';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { empresaPublicRepository } from '@/core/infrastructure/database';
import { initiateRedsysMesaPaymentUseCase } from '@/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase';

const initiateMesaSchema = z.object({
  mesaId: z.string().uuid(),
  esDivision: z.boolean().default(false),
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

  const parsed = initiateMesaSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const origin = request.nextUrl.origin;
  const { mesaId, esDivision } = parsed.data;

  const result = await initiateRedsysMesaPaymentUseCase({
    mesaId,
    empresaId: empresaResult.data.id,
    esDivision,
    // urlOk → confirm-mesa processes the Redsys POST and then redirects to the ticket.
    // This acts as a reliable fallback when the server-to-server webhook is delayed or fails.
    urlOk: `${origin}/api/redsys/confirm-mesa?redirect=/mesa/${mesaId}/orders`,
    urlKo: `${origin}/api/redsys/cancel-mesa?mesaId=${mesaId}&redirect=/mesa/${mesaId}/orders`,
    webhookUrl: `${origin}/api/redsys/webhook`,
  });

  return handleResult(result);
}
