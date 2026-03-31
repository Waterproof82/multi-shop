import { NextRequest, NextResponse } from 'next/server';
import { tgtgUseCase } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { generateReservaToken } from '@/lib/reserva-token';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email().max(254),
  promoId: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  const { id: itemId } = await params;

  const { searchParams } = new URL(request.url);
  const parsed = schema.safeParse({
    email: searchParams.get('email'),
    promoId: searchParams.get('promoId'),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const { email, promoId } = parsed.data;

  try {
    const itemResult = await tgtgUseCase.getPublicItem(itemId);
    if (!itemResult.success) {
      return NextResponse.json({ error: 'Error al obtener oferta' }, { status: 500 });
    }
    if (!itemResult.data) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    const item = itemResult.data;

    if (item.tgtgPromoId !== promoId) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    if (item.cuponesDisponibles <= 0) {
      return NextResponse.json({ error: 'no_cupones' }, { status: 200 });
    }

    // Verify pickup window hasn't passed
    const promoResult = await tgtgUseCase.getPublicPromo(promoId);
    if (promoResult.success && promoResult.data) {
      const promo = promoResult.data;
      const promoDate = promo.fechaActivacion || new Date(promo.createdAt).toISOString().split('T')[0];
      const horaFinNorm = promo.horaRecogidaFin.length === 5
        ? `${promo.horaRecogidaFin}:00`
        : promo.horaRecogidaFin;
      if (new Date() > new Date(`${promoDate}T${horaFinNorm}`)) {
        return NextResponse.json({ error: 'expired' }, { status: 200 });
      }
    }

    const token = generateReservaToken(email, itemId, promoId);
    return NextResponse.json({ token });
  } catch (error) {
    await logApiError('Get new TGTG token', error, 'GET');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
