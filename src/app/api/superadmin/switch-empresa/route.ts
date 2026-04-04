import { NextRequest, NextResponse } from 'next/server';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin || admin.rol !== 'superadmin') {
    return NextResponse.redirect(new URL('/superadmin', request.url));
  }

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresaId');

  if (!empresaId) {
    return NextResponse.redirect(new URL('/superadmin', request.url));
  }

  const redirectUrl = new URL('/admin', request.url);
  redirectUrl.searchParams.set('t', Date.now().toString());
  
  const response = NextResponse.redirect(redirectUrl);
  
  response.cookies.set('superadmin_empresa_id', empresaId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60,
  });

  return response;
}
