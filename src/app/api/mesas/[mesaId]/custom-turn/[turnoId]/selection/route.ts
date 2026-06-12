import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { updateCustomSelectionUseCase } from '@/core/application/use-cases/payment/updateCustomSelectionUseCase';

const paramsSchema = z.object({
  mesaId:  z.string().uuid(),
  turnoId: z.string().uuid(),
});

const selectionItemSchema = z.object({
  pedido_id: z.string().uuid(),
  item_idx:  z.number().int().min(0),
  unidades:  z.number().int().min(1),
});

const bodySchema = z.object({
  seleccion:    z.array(selectionItemSchema).max(100),
  importeCents: z.number().int().min(0),
});

export async function PATCH(
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

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.errors[0].message }, { status: 400 });
  }

  const result = await updateCustomSelectionUseCase({
    turnoId,
    seleccion:    parsedBody.data.seleccion,
    importeCents: parsedBody.data.importeCents,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  if (!result.data.success) {
    const errorCode = result.data.errorCode;
    const status = errorCode === 'TURNO_NOT_FOUND' ? 404
      : errorCode === 'INVALID_STATUS' ? 409
      : errorCode === 'ITEM_UNAVAILABLE' ? 409
      : 400;
    return NextResponse.json({ error: errorCode }, { status });
  }
  return NextResponse.json({ ok: true });
}
