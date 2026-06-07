import { NextResponse } from 'next/server';
import { empresaPublicRepository, descuentoUseCase } from '@/core/infrastructure/database';
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { validateDiscountCodeSchema } from '@/core/application/dtos/descuento.dto';

export async function POST(request: Request) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain);

  const empresaResult = await empresaPublicRepository.findByDomainPublic(mainDomain);
  if (!empresaResult.success) {
    return NextResponse.json({ error: 'Error al buscar empresa' }, { status: 500 });
  }
  const empresa = empresaResult.data;
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = validateDiscountCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { codigo, email } = parsed.data;
  const result = await descuentoUseCase.validateCode(codigo, empresa.id, email);

  if (!result.success) {
    const errorMap: Record<string, { message: string; status: number }> = {
      CODE_NOT_FOUND: { message: 'Código no encontrado', status: 404 },
      CODE_EXPIRED: { message: 'El código ha expirado', status: 400 },
      CODE_ALREADY_USED: { message: 'El código ya fue utilizado', status: 400 },
      EMAIL_MISMATCH: { message: 'El email no coincide con el código', status: 400 },
    };
    const mapped = errorMap[result.error.code];
    if (mapped) {
      return NextResponse.json({ valid: false, error: mapped.message, code: result.error.code }, { status: mapped.status });
    }
    return NextResponse.json({ valid: false, error: 'Error al validar el código' }, { status: 500 });
  }

  return NextResponse.json({ valid: true, porcentaje: result.data.porcentajeDescuento });
}
