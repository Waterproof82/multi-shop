import { cookies } from 'next/headers';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Returns the CSRF HMAC secret, throwing at runtime if the env var is missing.
 * The guard is intentionally lazy (not at module load time) so Next.js can
 * evaluate the module during build without env vars present. At actual request
 * time, the missing secret will throw immediately before any token is signed.
 */
function getCsrfSecret(): string {
  const secret = process.env.CSRF_HMAC_SECRET;
  if (!secret) {
    throw new Error('CSRF_HMAC_SECRET environment variable is required');
  }
  return secret;
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function signCsrfToken(token: string): string {
  return createHmac('sha256', getCsrfSecret()).update(token).digest('hex');
}

export function verifyCsrfToken(token: string, signature: string): boolean {
  const expectedSignature = signCsrfToken(token);
  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
  } catch {
    return false;
  }
}

export async function getCsrfCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE_NAME)?.value || null;
}

export function setCsrfCookieHeaders(): Record<string, string> {
  const token = generateCsrfToken();
  const signature = signCsrfToken(token);
  
  return {
    [CSRF_COOKIE_NAME]: `${token}:${signature}`,
    'Path': '/',
    'HttpOnly': 'true',
    'Secure': process.env.NODE_ENV === 'production' ? 'true' : 'false',
    'SameSite': 'strict',
    'Max-Age': '3600',
  };
}

export function getCsrfTokenFromHeader(request: Request): string | null {
  return request.headers.get(CSRF_HEADER_NAME);
}

export async function validateCsrfRequest(request: Request): Promise<boolean> {
  const cookieValue = await getCsrfCookie();
  const headerToken = getCsrfTokenFromHeader(request);
  
  if (!cookieValue || !headerToken) {
    return false;
  }
  
  const [token, signature] = cookieValue.split(':');
  if (!verifyCsrfToken(token, signature)) return false;
  try {
    return timingSafeEqual(Buffer.from(headerToken), Buffer.from(token));
  } catch {
    return false;
  }
}

export { CSRF_HEADER_NAME };
