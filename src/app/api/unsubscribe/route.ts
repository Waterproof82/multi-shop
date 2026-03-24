import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clienteUseCase } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';

const emailSchema = z.string().email();
const uuidSchema = z.string().uuid();

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
  const baseUrl = getBaseUrl(request);

  try {
    const rateLimited = await rateLimitPublic(request);
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    let email = searchParams.get('email');
    const empresaId = searchParams.get('empresa');
    const action = searchParams.get('action') as 'alta' | 'baja' | null;
    const token = searchParams.get('token');

    if (!email || !empresaId || !emailSchema.safeParse(email).success || !uuidSchema.safeParse(empresaId).success) {
      return NextResponse.redirect(`${baseUrl}/?error=invalid`);
    }

    if (!action || (action !== 'alta' && action !== 'baja')) {
      return NextResponse.redirect(`${baseUrl}/?error=invalid`);
    }

    // Decode email if it's URL encoded
    try {
      email = decodeURIComponent(email);
    } catch {
      // Keep original if decode fails
    }

    // Normalizar email: trim, lowercase
    const normalizedEmail = email.trim().toLowerCase();

    // Verify HMAC-signed token — prevents unauthorized subscription toggling
    if (!token || !verifyUnsubscribeToken(token, normalizedEmail, empresaId, action)) {
      return NextResponse.redirect(`${baseUrl}/?error=invalid`);
    }

    const nuevoValor = await clienteUseCase.togglePromoSubscription(normalizedEmail, empresaId, action ?? undefined);

    if (!nuevoValor.success) {
      return NextResponse.redirect(`${baseUrl}/?error=internal`);
    }

    const nuevoValorData = nuevoValor.data;

    if (nuevoValorData === null) {
      return NextResponse.redirect(`${baseUrl}/?error=notfound`);
    }

    const mensaje = nuevoValorData ? 'promo=on' : 'promo=off';
    return NextResponse.redirect(`${baseUrl}/?${mensaje}`);
  } catch {
    return NextResponse.redirect(`${baseUrl}/?error=internal`);
  }
}
