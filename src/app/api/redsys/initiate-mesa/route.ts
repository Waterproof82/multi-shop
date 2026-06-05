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
  /** Client's expected total in cents for race-condition guard */
  expectedTotalCents: z.number().int().positive().optional(),
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
  const { mesaId, esDivision, expectedTotalCents } = parsed.data;

  const result = await initiateRedsysMesaPaymentUseCase({
    mesaId,
    empresaId: empresaResult.data.id,
    esDivision,
    expectedTotalCents,
    // urlOk → confirm-mesa processes the Redsys POST and then redirects to the ticket.
    // This acts as a reliable fallback when the server-to-server webhook is delayed or fails.
    urlOk: `${origin}/api/redsys/confirm-mesa?redirect=/mesa/${mesaId}/orders`,
    urlKo: `${origin}/api/redsys/cancel-mesa?mesaId=${mesaId}&redirect=/mesa/${mesaId}/orders`,
    webhookUrl: `${origin}/api/redsys/webhook`,
  });

  if (!result.success && result.error.code === 'TOTAL_MISMATCH') {
    // Parse the newTotalCents from the error message (encoded as JSON)
    try {
      const payload = JSON.parse(result.error.message) as { newTotalCents: number };
      return NextResponse.json({ code: 'TOTAL_MISMATCH', newTotalCents: payload.newTotalCents }, { status: 409 });
    } catch {
      return NextResponse.json({ code: 'TOTAL_MISMATCH' }, { status: 409 });
    }
  }

  if (!result.success && result.error.code === 'ALREADY_PAID') {
    return NextResponse.json({ code: 'ALREADY_PAID' }, { status: 409 });
  }

  return handleResult(result);
}
