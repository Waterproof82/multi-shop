import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clienteUseCase } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const emailSchema = z.string().email();
const uuidSchema = z.string().uuid();

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) throw new Error('NEXT_PUBLIC_BASE_URL no está configurado');
  return baseUrl;
}

export async function GET(request: Request) {
  try {
    const rateLimited = await rateLimitPublic(request);
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    let email = searchParams.get('email');
    const empresaId = searchParams.get('empresa');
    const action = searchParams.get('action') as 'alta' | 'baja' | null;

    if (!email || !empresaId || !emailSchema.safeParse(email).success || !uuidSchema.safeParse(empresaId).success) {
      return NextResponse.redirect(`${getBaseUrl()}/?error=invalid`);
    }

    // Decode email if it's URL encoded
    try {
      email = decodeURIComponent(email);
    } catch {
      // Keep original if decode fails
    }

    // Normalizar email: trim, lowercase
    const normalizedEmail = email.trim().toLowerCase();

    const nuevoValor = await clienteUseCase.togglePromoSubscription(normalizedEmail, empresaId, action ?? undefined);

    if (nuevoValor === null) {
      return NextResponse.redirect(`${getBaseUrl()}/?error=notfound`);
    }

    const baseUrl = getBaseUrl();
    const mensaje = nuevoValor ? 'promo=on' : 'promo=off';
    return NextResponse.redirect(`${baseUrl}/?${mensaje}`);
  } catch (error) {
    console.error('Promo error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/?error=internal`);
  }
}
