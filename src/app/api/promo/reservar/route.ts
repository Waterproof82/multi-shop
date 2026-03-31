import { NextRequest, NextResponse } from 'next/server';
import { tgtgUseCase } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { verifyReservaToken } from '@/lib/reserva-token';
import { claimCuponSchema } from '@/core/application/dtos/tgtg.dto';

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitPublic(request);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = claimCuponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { itemId, tgtgPromoId, email, token } = parsed.data;

  // Verify HMAC token before any DB operation
  let tokenValid = false;
  try {
    tokenValid = verifyReservaToken(token, email, itemId, tgtgPromoId);
  } catch {
    return NextResponse.json({ error: 'token_invalid' }, { status: 400 });
  }

  if (!tokenValid) {
    return NextResponse.json({ error: 'token_invalid' }, { status: 400 });
  }

  try {
    // Check if pickup window has passed: combine promo creation date + hora_recogida_fin
    const promoResult = await tgtgUseCase.getPublicPromo(tgtgPromoId);
    if (!promoResult.success || !promoResult.data) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const promo = promoResult.data;
    // Use fechaActivacion (set by admin) as the reference date, fall back to createdAt for legacy rows
    const promoDate = promo.fechaActivacion || new Date(promo.createdAt).toISOString().split('T')[0];
    // Normalize horaRecogidaFin: DB may return "HH:MM:SS" or "HH:MM"
    const horaFinNorm = promo.horaRecogidaFin.length === 5
      ? `${promo.horaRecogidaFin}:00`
      : promo.horaRecogidaFin;
    const pickupEndIso = `${promoDate}T${horaFinNorm}`;
    if (new Date() > new Date(pickupEndIso)) {
      return NextResponse.json({ result: 'expired' }, { status: 200 });
    }

    const result = await tgtgUseCase.claimCupon({ itemId, tgtgPromoId, email, token });

    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    const outcome = result.data;
    if (outcome === 'token_used') {
      return NextResponse.json({ result: 'token_used' }, { status: 409 });
    }
    if (outcome === 'no_cupones') {
      return NextResponse.json({ result: 'no_cupones' }, { status: 200 });
    }

    return NextResponse.json({ result: 'ok' }, { status: 200 });
  } catch (error) {
    await logApiError('Claim TGTG cupon', error, 'POST');
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
