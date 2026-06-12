import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { commitCustomPaymentUseCase } from '@/core/application/use-cases/payment/commitCustomPaymentUseCase';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const paramsSchema = z.object({
  mesaId:  z.string().uuid(),
  turnoId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mesaId: string; turnoId: string }> }
) {
  const { mesaId, turnoId } = await params;
  const parsedParams = paramsSchema.safeParse({ mesaId, turnoId });
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  // Resolve empresaId from turno
  const supabase = getSupabaseClient();
  const { data: turnoRow } = await supabase
    .from('mesa_pagos_personalizados')
    .select('empresa_id')
    .eq('id', turnoId)
    .maybeSingle();
  const empresaId = (turnoRow as { empresa_id: string } | null)?.empresa_id;
  if (!empresaId) return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 });

  // Build Redsys callback URLs server-side (same pattern as initiate-mesa)
  const origin = new URL(request.url).origin;
  const urlOk      = `${origin}/api/redsys/confirm-mesa?redirect=/mesa/${mesaId}/orders`;
  const urlKo      = `${origin}/api/redsys/cancel-mesa?mesaId=${mesaId}&redirect=/mesa/${mesaId}/orders`;
  const webhookUrl = `${origin}/api/redsys/webhook`;

  const result = await commitCustomPaymentUseCase({
    turnoId,
    mesaId,
    empresaId,
    urlOk,
    urlKo,
    webhookUrl,
  });

  if (!result.success) {
    const status = result.error.code === 'NOT_FOUND' ? 404
      : result.error.code === 'CONFLICT' ? 409
      : result.error.code === 'PAYMENT_NOT_CONFIGURED' ? 422
      : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  if (result.data.type === 'no_amount') {
    return NextResponse.json({ error: result.data.errorCode }, { status: 409 });
  }

  return NextResponse.json(result.data.formData);
}
