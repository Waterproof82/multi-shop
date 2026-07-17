import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitMesaPolling } from '@/core/infrastructure/api/rate-limit';
import { getMesaOrdersUseCase, MESA_TENANT_MISMATCH } from '@/core/application/use-cases/mesa/getMesaOrdersUseCase';
import { getEmpresaPublicRepository } from '@/core/infrastructure/database';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const rateLimited = await rateLimitMesaPolling(parsed.data);
  if (rateLimited) return rateLimited;

  let empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    const domain = await getDomainFromHeaders();
    const empresaResult = await getEmpresaPublicRepository().findByDomain(parseMainDomain(domain));
    if (!empresaResult.success || !empresaResult.data) {
      return NextResponse.json({ error: 'Tenant no identificado' }, { status: 400 });
    }
    empresaId = empresaResult.data.id;
  }

  const result = await getMesaOrdersUseCase(parsed.data, empresaId);
  if (result === MESA_TENANT_MISMATCH) {
    return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
  }
  if (result === null) {
    return NextResponse.json({ orders: [], sesionId: null, total: 0 });
  }
  return NextResponse.json(result);
}
