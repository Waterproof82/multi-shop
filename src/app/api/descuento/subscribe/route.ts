import { NextResponse } from 'next/server';
import { empresaPublicRepository, descuentoUseCase } from '@/core/infrastructure/database';
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { subscribeWelcomeDiscountSchema } from '@/core/application/dtos/descuento.dto';

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
  if (!empresa.descuentoBienvenidaActivo) {
    return NextResponse.json({ error: 'Descuento de bienvenida no activo' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = subscribeWelcomeDiscountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { email } = parsed.data;
  const idioma = (request.headers.get('accept-language') || 'es').split(',')[0].split('-')[0].slice(0, 2);
  const validIdiomas = ['es', 'en', 'fr', 'it', 'de'];
  const resolvedIdioma = validIdiomas.includes(idioma) ? idioma : 'es';

  const result = await descuentoUseCase.subscribe(empresa.id, email, empresa.nombre, resolvedIdioma);

  if (!result.success) {
    if (result.error.code === 'ALREADY_SUBSCRIBED') {
      return NextResponse.json({ error: 'Este email ya tiene un código de descuento' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
