import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { verifyCsrfToken } from '@/lib/csrf';
import { timingSafeEqual } from 'node:crypto';
import { isTokenRevoked } from '@/lib/token-revocation';
import { AUTH_ERRORS, SERVER_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';
import { errorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { verifyWaiterToken } from '@/lib/waiter-auth';
import { verifyTpvEmployeeToken, signTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

function getAdminTokenSecret(): string | undefined {
  return process.env.ACCESS_TOKEN_SECRET;
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  // Capacitor native WebView origin — our own APK, always allowed.
  // Capacitor v5+ Android uses androidScheme: 'https' by default → Origin: https://localhost
  // Older versions or explicit config may send capacitor://localhost or ionic://localhost
  if (
    origin === 'https://localhost' ||
    origin === 'http://localhost' ||
    origin === 'capacitor://localhost' ||
    origin === 'ionic://localhost'
  ) return true;

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
  response.headers.set('Vary', 'Origin');
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
    path === '/api/admin/promociones/unsubscribe' ||
    path === '/api/admin/login' ||
    path === '/api/csp-report' ||
    path === '/api/promo/reservar' ||
    path.startsWith('/api/promo/item/')
  );
}

async function handleAdminAuth(request: NextRequest, origin: string | null): Promise<NextResponse> {
  // Rate limit before JWT verification to prevent brute-force flooding of the verify step
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return addCorsHeaders(rateLimited, origin);

  const adminToken = request.cookies.get('admin_token')?.value;

  if (!adminToken) {
    return addCorsHeaders(NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 }), origin);
  }

  const tokenSecret = getAdminTokenSecret();
  if (!tokenSecret) {
    return addCorsHeaders(NextResponse.json(createErrorResponse(SERVER_ERRORS.CONFIG_ERROR), { status: 500 }), origin);
  }

  try {
    const secret = new TextEncoder().encode(tokenSecret);
    const { payload } = await jwtVerify(adminToken, secret);

    if (!payload.adminId) {
      return addCorsHeaders(NextResponse.json(createErrorResponse(AUTH_ERRORS.INVALID_TOKEN), { status: 401 }), origin);
    }

    // Superadmin can have null empresaId - allow it
    // For regular admins, empresaId is required

    // Reject tokens without jti — they cannot be revoked and are permanently valid.
    // Also reject tokens whose jti appears in the revocation list (logged-out sessions).
    if (!payload.jti || await isTokenRevoked(payload.jti)) {
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
      const csrfHeaderMatchesToken = (() => {
        try { return timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(token)); }
        catch { return false; }
      })();
      if (!token || !signature || !verifyCsrfToken(token, signature) || !csrfHeaderMatchesToken) {
        return addCorsHeaders(NextResponse.json(
          createErrorResponse(AUTH_ERRORS.CSRF_INVALID),
          { status: 403 }
        ), origin);
      }
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-empresa-id', (payload.empresaId as string | undefined) ?? '');
    requestHeaders.set('x-admin-id', payload.adminId as string);
    requestHeaders.set('x-admin-rol', payload.rol as string);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('x-empresa-id', (payload.empresaId as string | undefined) ?? '');
    response.headers.set('x-admin-id', payload.adminId as string);
    response.headers.set('x-admin-rol', payload.rol as string);
    return addCorsHeaders(response, origin);
  } catch {
    return addCorsHeaders(NextResponse.json(createErrorResponse(AUTH_ERRORS.INVALID_TOKEN), { status: 401 }), origin);
  }
}

function normalizeR2Origin(raw: string | undefined): string {
  if (!raw) return '';
  // Strip any existing protocol so we always produce a clean https:// origin
  const stripped = raw.replace(/^https?:\/\//, '');
  return `https://${stripped}`;
}

function buildCsp(nonce: string, path: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const r2Origin = normalizeR2Origin(process.env.NEXT_PUBLIC_R2_DOMAIN);
  const imgSources = ["'self'", r2Origin, "https://*.supabase.co", "data:", "blob:"]
    .filter(Boolean).join(' ');
  const mediaSources = ["'self'", r2Origin]
    .filter(Boolean).join(' ');

  // In production: nonce + strict-dynamic (Next.js auto-injects nonce on its own scripts).
  // In dev: unsafe-inline + unsafe-eval needed for Turbopack HMR.
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  // Admin pages must not be embeddable — use 'none' to align with X-Frame-Options: DENY
  // set in next.config.mjs for /admin/* routes.
  const frameAncestors = path.startsWith('/admin') ? "frame-ancestors 'none'" : "frame-ancestors 'self'";

  // In dev: allow localhost for API calls and hot module reloading
  const devConnectSrc = isDev ? " http://localhost:* https://localhost:*" : "";

  // Allow R2 origin in connect-src for fetching images via fetch()
  const connectR2 = r2Origin ? ` ${r2Origin}` : "";

  return [
    "default-src 'self'",
    scriptSrc,
    // 'unsafe-inline' for style-src is accepted risk: Tailwind v4 injects runtime
    // styles that cannot be nonce-attributed. Upgrading to hash-based CSP requires
    // a Tailwind v4 CSP plugin that does not yet exist. Tracked as P3.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources}`,
    `media-src ${mediaSources}`,
    "font-src 'self'",
    "worker-src 'self'",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.brevo.com https://*.upstash.io https://api.mapbox.com https://events.mapbox.com https://*.sentry.io${connectR2}${devConnectSrc}`,
    `frame-src 'self' https://www.google.com https://maps.google.com${process.env.VERCEL_ENV !== 'production' ? ' https://vercel.live https://*.vercel.live' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://sis-t.redsys.es:25443 https://sis.redsys.es",
    frameAncestors,
    "report-uri /api/csp-report",
  ].join('; ');
}

async function handleWaiterAuth(request: NextRequest, origin: string | null): Promise<NextResponse> {
  const waiterToken = request.cookies.get('waiter_token')?.value;

  if (!waiterToken) {
    return addCorsHeaders(
      NextResponse.json({ error: 'WAITER_UNAUTHORIZED' }, { status: 401 }),
      origin
    );
  }

  const payload = await verifyWaiterToken(waiterToken);
  if (!payload) {
    return addCorsHeaders(
      NextResponse.json({ error: 'WAITER_UNAUTHORIZED' }, { status: 401 }),
      origin
    );
  }

  // CSRF check for mutative methods — mirrors handleTpvEmployeeAuth pattern
  const isMutativeMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);
  if (isMutativeMethod) {
    const csrfCookie = request.cookies.get('csrf_token')?.value;
    const csrfHeader = request.headers.get('x-csrf-token');
    if (!csrfHeader || !csrfCookie) {
      return addCorsHeaders(
        NextResponse.json(createErrorResponse(AUTH_ERRORS.CSRF_REQUIRED), { status: 403 }),
        origin
      );
    }
    const [tokenCsrf, signature] = csrfCookie.split(':');
    const csrfHeaderMatchesToken = (() => {
      try { return timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(tokenCsrf)); }
      catch { return false; }
    })();
    if (!tokenCsrf || !signature || !verifyCsrfToken(tokenCsrf, signature) || !csrfHeaderMatchesToken) {
      return addCorsHeaders(
        NextResponse.json(createErrorResponse(AUTH_ERRORS.CSRF_INVALID), { status: 403 }),
        origin
      );
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-empresa-id', payload.empresaId);
  requestHeaders.set('x-waiter-role', 'waiter');

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-empresa-id', payload.empresaId);
  response.headers.set('x-waiter-role', 'waiter');
  return addCorsHeaders(response, origin);
}

async function handleTpvEmployeeAuth(request: NextRequest, origin: string | null): Promise<NextResponse> {
  const token = request.cookies.get('tpv_employee_token')?.value;
  if (!token) {
    return addCorsHeaders(
      NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 }),
      origin
    );
  }

  const payload = await verifyTpvEmployeeToken(token);
  if (!payload) {
    return addCorsHeaders(
      NextResponse.json(createErrorResponse(AUTH_ERRORS.INVALID_TOKEN), { status: 401 }),
      origin
    );
  }

  // CSRF check for mutative methods
  const isMutativeMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);
  if (isMutativeMethod) {
    const csrfCookie = request.cookies.get('csrf_token')?.value;
    const csrfHeader = request.headers.get('x-csrf-token');
    if (!csrfHeader || !csrfCookie) {
      return addCorsHeaders(
        NextResponse.json(createErrorResponse(AUTH_ERRORS.CSRF_REQUIRED), { status: 403 }),
        origin
      );
    }
    const [tokenCsrf, signature] = csrfCookie.split(':');
    const csrfHeaderMatchesToken = (() => {
      try { return timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(tokenCsrf)); }
      catch { return false; }
    })();
    if (!tokenCsrf || !signature || !verifyCsrfToken(tokenCsrf, signature) || !csrfHeaderMatchesToken) {
      return addCorsHeaders(
        NextResponse.json(createErrorResponse(AUTH_ERRORS.CSRF_INVALID), { status: 403 }),
        origin
      );
    }
  }

  // Late-window refresh: if token expires in < 15 min, verify employee is still active
  const now = Math.floor(Date.now() / 1000);
  const REFRESH_THRESHOLD_SECS = 15 * 60;
  let refreshedToken: string | undefined;

  if (payload.exp - now < REFRESH_THRESHOLD_SECS) {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('empleados_tpv')
      .select('id')
      .eq('id', payload.empleadoId)
      .eq('activo', true)
      .maybeSingle();

    if (data) {
      refreshedToken = await signTpvEmployeeToken({
        empleadoId: payload.empleadoId,
        empresaId: payload.empresaId,
        nombre: payload.nombre,
        rol: payload.rol,
      });
    }
    // If not active, don't renew — token will expire within 15 min
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-empresa-id', payload.empresaId);
  requestHeaders.set('x-admin-rol', payload.rol);
  requestHeaders.set('x-employee-id', payload.empleadoId);
  requestHeaders.set('x-employee-nombre', payload.nombre);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-empresa-id', payload.empresaId);
  response.headers.set('x-admin-rol', payload.rol);
  response.headers.set('x-employee-id', payload.empleadoId);
  response.headers.set('x-employee-nombre', payload.nombre);

  if (refreshedToken) {
    response.cookies.set('tpv_employee_token', refreshedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    });
  }

  return addCorsHeaders(response, origin);
}

/** Cocina usa el mismo PIN que el camarero; auth y logout quedan fuera. */
function isWaiterRoute(path: string): boolean {
  if (path.startsWith('/api/kitchen')) return true;
  return path.startsWith('/api/waiter') && path !== '/api/waiter/auth' && path !== '/api/waiter/logout';
}

/**
 * Rutas de /api/tpv que no exigen sesión.
 *
 * El token del inspector viaja en `Authorization: Bearer`, NUNCA en query param:
 * un query param acaba escrito en los logs de acceso del CDN y del servidor.
 */
function isPublicTpvRoute(path: string, request: NextRequest): boolean {
  if (path === '/api/tpv/empleados/login' || path === '/api/tpv/empleados/logout' || path === '/api/tpv/activate') {
    return true;
  }
  if (path !== '/api/tpv/audit/export') return false;
  return request.headers.get('authorization')?.startsWith('Bearer ') ?? false;
}

/**
 * Admin primero, empleado de TPV después. Lo comparten /api/tpv y /api/laborcontrol.
 *
 * El ORDEN es parte del contrato: un admin que abre el TPV lleva `admin_token`,
 * y probar primero el de empleado le asignaría el rol equivocado.
 */
async function handleAdminOrEmployeeAuth(request: NextRequest, origin: string | null): Promise<NextResponse> {
  const adminResult = await handleAdminAuth(request, origin);
  if (adminResult.status === 200) return adminResult;
  return handleTpvEmployeeAuth(request, origin);
}

/** Una sesión de admin válida NO basta: hace falta además el rol. */
async function handleSuperadminAuth(request: NextRequest, origin: string | null): Promise<NextResponse> {
  const adminAuthResponse = await handleAdminAuth(request, origin);
  if (adminAuthResponse.status !== 200) return adminAuthResponse;
  if (adminAuthResponse.headers.get('x-admin-rol') !== 'superadmin') {
    return addCorsHeaders(errorResponse('Acceso denegado', 403), origin);
  }
  return adminAuthResponse;
}

/**
 * Respuesta normal: nonce por petición + CSP, y CORS si la ruta es de API.
 *
 * Aquí caen también las rutas públicas que NO hacen `return` antes — por ejemplo
 * `/api/admin/login`. Es una asimetría real y deliberada respecto a
 * `/api/tpv/empleados/login`, que sale antes y NO recibe ni CSP ni CORS.
 * Está cubierta por `tests/compliance/proxy-autorizacion.test.ts`.
 */
function buildPageResponse(request: NextRequest, path: string, origin: string | null): NextResponse {
  // Generate per-request nonce for CSP (HIGH-005)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-pathname', path);

  const csp = buildCsp(nonce, path);
  // Set on request so server components can read it via headers()
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set on response so the browser enforces it
  response.headers.set('Content-Security-Policy', csp);

  // Add CORS headers to public API routes (pedidos subdomain may differ from main domain)
  if (path.startsWith('/api/')) {
    addCorsHeaders(response, origin);
  }

  return response;
}

/**
 * ESTA CADENA ESTÁ ORDENADA Y EL ORDEN ES PARTE DEL CONTRATO.
 *
 * Añadir una ruta en el sitio equivocado, o mover un bloque, no rompe ningún
 * test de negocio ni falla en desarrollo: solo deja una puerta abierta. La tabla
 * completa —qué bloquea y qué pasa libre— está congelada en
 * `tests/compliance/proxy-autorizacion.test.ts`.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const origin = request.headers.get('origin');

  // Preflight CORS
  if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
    return addCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  if (path.startsWith('/api/admin') && !isPublicRoute(path)) {
    return handleAdminAuth(request, origin);
  }

  if (isWaiterRoute(path)) {
    return handleWaiterAuth(request, origin);
  }

  if (path.startsWith('/api/tpv')) {
    if (isPublicTpvRoute(path, request)) return NextResponse.next();
    return handleAdminOrEmployeeAuth(request, origin);
  }

  // Los cron de LaborControl validan CRON_SECRET dentro de la propia ruta.
  if (path.startsWith('/api/laborcontrol')) {
    if (path.startsWith('/api/laborcontrol/cron/')) return NextResponse.next();
    return handleAdminOrEmployeeAuth(request, origin);
  }

  // Despacho manual a Glovo — acción de admin. /api/glovo/webhook (verifica HMAC
  // internamente, lo llaman los servidores de Glovo) y /api/glovo/quote (público,
  // acotado por dominio) deben quedar FUERA de este check.
  if (path === '/api/glovo/order') {
    return handleAdminAuth(request, origin);
  }

  if (path.startsWith('/api/superadmin')) {
    return handleSuperadminAuth(request, origin);
  }

  return buildPageResponse(request, path, origin);
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
