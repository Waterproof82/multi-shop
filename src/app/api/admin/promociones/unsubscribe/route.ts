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
    const email = searchParams.get('email');
    const empresaId = searchParams.get('empresa');
    const token = searchParams.get('token');

    if (!email || !empresaId || !emailSchema.safeParse(email).success || !uuidSchema.safeParse(empresaId).success) {
      return NextResponse.redirect(`${baseUrl}/?error=invalid`);
    }

    const normalizedEmail = decodeURIComponent(email).trim().toLowerCase();

    // Verify HMAC-signed token — prevents unauthorized subscription toggling
    if (!token || !verifyUnsubscribeToken(token, normalizedEmail, empresaId, 'baja')) {
      return NextResponse.redirect(`${baseUrl}/?error=invalid`);
    }

    const nuevoValor = await clienteUseCase.togglePromoSubscription(normalizedEmail, empresaId);

    if (nuevoValor === null) {
      return NextResponse.redirect(`${baseUrl}/?error=notfound`);
    }

    const mensaje = nuevoValor ? 'promo=on' : 'promo=off';
    return NextResponse.redirect(`${baseUrl}/?${mensaje}`);
  } catch (error) {
    void error;
    return NextResponse.redirect(`${baseUrl}/?error=internal`);
  }
}
