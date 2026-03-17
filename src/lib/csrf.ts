import { cookies } from 'next/headers';
import { randomBytes, createHmac } from 'crypto';

const CSRF_SECRET = process.env.ACCESS_TOKEN_SECRET || 'fallback-secret-change-me';
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function signCsrfToken(token: string): string {
  return createHmac('sha256', CSRF_SECRET).update(token).digest('hex');
}

export function verifyCsrfToken(token: string, signature: string): boolean {
  const expectedSignature = signCsrfToken(token);
  return signature === expectedSignature;
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
  return verifyCsrfToken(token, signature) && headerToken === token;
}

export { CSRF_HEADER_NAME };
