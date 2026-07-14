import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  const admin = await getAuthAdminUseCase().verifyToken(token);

  if (!admin || admin.rol !== 'superadmin') {
    return NextResponse.redirect(new URL('/superadmin', request.url));
  }

  const { searchParams } = new URL(request.url);
  const rawEmpresaId = searchParams.get('empresaId');
  const parsed = z.string().uuid().safeParse(rawEmpresaId);

  if (!parsed.success) {
    return NextResponse.redirect(new URL('/superadmin', request.url));
  }

  const empresaId = parsed.data;

  const response = NextResponse.redirect(new URL('/admin', request.url));
  
  response.cookies.set('superadmin_empresa_id', empresaId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60,
  });

  return response;
}
