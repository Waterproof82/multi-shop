import { NextResponse } from 'next/server';
import { clienteUseCase } from '@/core/infrastructure/database';

function getBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) throw new Error('NEXT_PUBLIC_BASE_URL no está configurado');
  return baseUrl;
}

export async function GET(request: Request) {
  try {
    const baseUrl = getBaseUrl();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const empresaId = searchParams.get('empresa');

    if (!email || !empresaId) {
      return NextResponse.redirect(`${baseUrl}/?error=invalid`);
    }

    const nuevoValor = await clienteUseCase.togglePromoSubscription(email, empresaId);

    if (nuevoValor === null) {
      return NextResponse.redirect(`${baseUrl}/?error=notfound`);
    }

    const mensaje = nuevoValor ? 'promo=on' : 'promo=off';
    return NextResponse.redirect(`${baseUrl}/?${mensaje}`);
  } catch (error) {
    console.error('[Unsubscribe] Error:', error);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    return NextResponse.redirect(`${baseUrl}/?error=internal`);
  }
}
