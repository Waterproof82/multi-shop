import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { registerManualMesaPaymentUseCase } from '@/core/application/use-cases/payment/registerManualMesaPaymentUseCase';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await registerManualMesaPaymentUseCase({ mesaId: parsed.data, empresaId });

  if (!result.success) {
    const status =
      result.error.code === 'NOT_FOUND' ? 404 :
      result.error.code === 'FORBIDDEN' ? 403 :
      result.error.code === 'ALREADY_PAID' ? 409 :
      500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.json(result.data);
}
