import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { getEmpresaPublicRepository } from '@/core/infrastructure/database';
import { getDeliveryQuoteUseCase } from '@/core/application/use-cases/glovo/getDeliveryQuoteUseCase';

const GetDeliveryQuoteSchema = z.object({
  address: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  orderTotalCents: z.number().int().min(0),
});

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain);
  const empresaResult = await getEmpresaPublicRepository().findByDomain(mainDomain);
  if (!empresaResult.success || !empresaResult.data) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = GetDeliveryQuoteSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0].message);

  const result = await getDeliveryQuoteUseCase({
    empresaId: empresaResult.data.id,
    deliveryAddress: parsed.data.address,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    orderTotalCents: parsed.data.orderTotalCents,
  });

  if (!result.success) {
    const status =
      result.error.code.startsWith('DEL_') ? 400 :
      result.error.code.startsWith('GLV_') ? 503 : 500;
    return NextResponse.json({ code: result.error.code, message: result.error.message }, { status });
  }
  return NextResponse.json(result.data);
}
