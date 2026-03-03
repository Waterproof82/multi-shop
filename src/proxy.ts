import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const path = request.nextUrl.pathname;

  // 1. Rutas de API admin - verificar JWT
  if (path.startsWith('/api/admin') && path !== '/api/admin/login' && !path.includes('/unsubscribe')) {
    const adminToken = request.cookies.get('admin_token')?.value;

    if (!adminToken) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    if (!ADMIN_TOKEN_SECRET) {
      console.error('[Proxy] ACCESS_TOKEN_SECRET no configurado');
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    try {
      const secret = new TextEncoder().encode(ADMIN_TOKEN_SECRET);
      const { payload } = await jwtVerify(adminToken, secret);
      
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-empresa-id', payload.empresaId as string);
      requestHeaders.set('x-admin-id', payload.adminId as string);
      requestHeaders.set('x-admin-rol', payload.rol as string);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch {
      return NextResponse.json(
        { error: 'Token inválido o expirado' },
        { status: 401 }
      );
    }
  }

  // 2. Manejo de access token para el carrito
  const accessToken = url.searchParams.get('access');

  if (accessToken) {
    const sanitizedToken = accessToken.replaceAll(/[^a-zA-Z0-9._-]/g, '');

    const secretKey = process.env.ACCESS_TOKEN_SECRET;

    if (!secretKey) {
      return NextResponse.next();
    }
    
    try {
      const secret = new TextEncoder().encode(secretKey);
      const { payload } = await jwtVerify(sanitizedToken, secret);
      
      url.searchParams.delete('access');
      const response = NextResponse.redirect(url);

      let maxAge = 15 * 60;
      if (payload?.exp) {
        const now = Math.floor(Date.now() / 1000);
        maxAge = Math.max(payload.exp - now, 0);
      }

      response.cookies.set('access_token', sanitizedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge,
      });

      return response;
    } catch {
      url.searchParams.delete('access');
      return NextResponse.redirect(url);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
