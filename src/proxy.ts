import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { verifyCsrfToken } from '@/lib/csrf';
import { AUTH_ERRORS, SERVER_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  if (process.env.NODE_ENV !== 'production') {
    if (origin.startsWith('http://localhost:')) return true;
  }

  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (configuredOrigins) {
    const allowedList = configuredOrigins.split(',').map(o => o.trim());
    if (allowedList.includes(origin)) return true;
  }

  try {
    const hostname = new URL(origin).hostname;
    const allowedDomains = (process.env.CORS_ALLOWED_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean);
    return allowedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function addCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-csrf-token');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');
  }
  return response;
}

function isPublicRoute(path: string): boolean {
  return (
    path === '/api/unsubscribe' ||
    path.startsWith('/api/admin/promociones/unsubscribe') ||
    path === '/api/admin/login' ||
    path === '/api/admin/logout' ||
    path === '/api/csp-report'
  );
}

async function handleAdminAuth(request: NextRequest, origin: string | null): Promise<NextResponse> {
  const adminToken = request.cookies.get('admin_token')?.value;

  if (!adminToken) {
    return addCorsHeaders(NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 }), origin);
  }

  if (!ADMIN_TOKEN_SECRET) {
    return addCorsHeaders(NextResponse.json(createErrorResponse(SERVER_ERRORS.CONFIG_ERROR), { status: 500 }), origin);
  }

  try {
    const secret = new TextEncoder().encode(ADMIN_TOKEN_SECRET);
    const { payload } = await jwtVerify(adminToken, secret);

    if (!payload.empresaId || !payload.adminId) {
      return addCorsHeaders(NextResponse.json(createErrorResponse(AUTH_ERRORS.INVALID_TOKEN), { status: 401 }), origin);
    }

    const csrfCookie = request.cookies.get('csrf_token')?.value;
    const csrfHeader = request.headers.get('x-csrf-token');

    const isMutativeMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);
    if (isMutativeMethod) {
      if (!csrfHeader || !csrfCookie) {
        return addCorsHeaders(NextResponse.json(
          createErrorResponse(AUTH_ERRORS.CSRF_REQUIRED),
          { status: 403 }
        ), origin);
      }

      const [token, signature] = csrfCookie.split(':');
      if (!token || !signature || !verifyCsrfToken(token, signature) || csrfHeader !== token) {
        return addCorsHeaders(NextResponse.json(
          createErrorResponse(AUTH_ERRORS.CSRF_INVALID),
          { status: 403 }
        ), origin);
      }
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-empresa-id', payload.empresaId as string);
    requestHeaders.set('x-admin-id', payload.adminId as string);
    requestHeaders.set('x-admin-rol', payload.rol as string);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    return addCorsHeaders(response, origin);
  } catch {
    return addCorsHeaders(NextResponse.json(createErrorResponse(AUTH_ERRORS.INVALID_TOKEN), { status: 401 }), origin);
  }
}

async function handleCartAccessToken(url: URL, accessToken: string): Promise<NextResponse> {
  const sanitizedToken = accessToken.replaceAll(/[^a-zA-Z0-9._-]/g, '');
  const secretKey = process.env.CART_TOKEN_SECRET;

  if (!secretKey) return NextResponse.next();

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

function normalizeR2Origin(raw: string | undefined): string {
  if (!raw) return '';
  // Strip any existing protocol so we always produce a clean https:// origin
  const stripped = raw.replace(/^https?:\/\//, '');
  return `https://${stripped}`;
}

function buildCsp(nonce: string): string {
  const r2Origin = normalizeR2Origin(process.env.NEXT_PUBLIC_R2_DOMAIN);
  const imgSources = ["'self'", r2Origin, "https://*.supabase.co", "data:", "blob:"]
    .filter(Boolean).join(' ');
  const mediaSources = ["'self'", r2Origin]
    .filter(Boolean).join(' ');

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources}`,
    `media-src ${mediaSources}`,
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co https://api.brevo.com https://*.upstash.io",
    "frame-src 'self' https://www.google.com https://maps.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const path = request.nextUrl.pathname;
  const origin = request.headers.get('origin');

  // Preflight CORS
  if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
    return addCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  // Admin auth (protected routes)
  if (path.startsWith('/api/admin') && !isPublicRoute(path)) {
    return handleAdminAuth(request, origin);
  }

  // Access token for cart
  const accessToken = url.searchParams.get('access');
  if (accessToken) {
    return handleCartAccessToken(url, accessToken);
  }

  // Generate per-request nonce for CSP (HIGH-005)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const csp = buildCsp(nonce);
  // Set on request so server components can read it via headers()
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set on response so the browser enforces it
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
