import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { cancelCustomTurnUseCase } from '@/core/application/use-cases/payment/cancelCustomTurnUseCase';

const paramsSchema = z.object({
  mesaId:  z.string().uuid(),
  turnoId: z.string().uuid(),
});

export async function DELETE(
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

  const result = await cancelCustomTurnUseCase({ turnoId });

  if (!result.success) {
    const status = result.error.code === 'CANNOT_CANCEL_PAYING' ? 409
      : result.error.code === 'TURNO_NOT_FOUND' ? 404
      : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
