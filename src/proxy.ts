import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

/**
 * Dominios permitidos para CORS.
 * Configurable via env var CORS_ALLOWED_ORIGINS (comma-separated).
 * En desarrollo, localhost:3000 se añade automáticamente.
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  // En desarrollo, permitir localhost
  if (process.env.NODE_ENV !== 'production') {
    if (origin.startsWith('http://localhost:')) return true;
  }

  // Dominios configurados via env var
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (configuredOrigins) {
    const allowedList = configuredOrigins.split(',').map(o => o.trim());
    if (allowedList.includes(origin)) return true;
  }

  // Permitir cualquier subdominio de dominios configurados (ej. pedidos.almadearena.es)
  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    const allowedDomains = (process.env.CORS_ALLOWED_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean);
    for (const domain of allowedDomains) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return true;
    }
  } catch {
    return false;
  }

  return false;
}

function addCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const path = request.nextUrl.pathname;
  const origin = request.headers.get('origin');

  // Preflight CORS (OPTIONS)
  if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
    const preflightResponse = new NextResponse(null, { status: 204 });
    return addCorsHeaders(preflightResponse, origin);
  }

  // 1. Rutas públicas que no requieren JWT
  const isPublicRoute = 
    path === '/api/unsubscribe' || 
    path.startsWith('/api/admin/promociones/unsubscribe') ||
    path === '/api/admin/login' ||
    path === '/api/admin/logout';
  
  if (path.startsWith('/api/admin') && !isPublicRoute) {
    const adminToken = request.cookies.get('admin_token')?.value;

    if (!adminToken) {
      return addCorsHeaders(NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      ), origin);
    }

    if (!ADMIN_TOKEN_SECRET) {
      console.error('[Proxy] ACCESS_TOKEN_SECRET no configurado');
      return addCorsHeaders(NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      ), origin);
    }

    try {
      const secret = new TextEncoder().encode(ADMIN_TOKEN_SECRET);
      const { payload } = await jwtVerify(adminToken, secret);

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-empresa-id', payload.empresaId as string);
      requestHeaders.set('x-admin-id', payload.adminId as string);
      requestHeaders.set('x-admin-rol', payload.rol as string);

      const response = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
      return addCorsHeaders(response, origin);
    } catch {
      return addCorsHeaders(NextResponse.json(
        { error: 'Token inválido o expirado' },
        { status: 401 }
      ), origin);
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
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
