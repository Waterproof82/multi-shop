import { randomBytes, createHmac, timingSafeEqual } from 'crypto';

const CSRF_COOKIE_NAME = 'csrf_token';

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

