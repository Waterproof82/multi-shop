import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year — GDPR/CAN-SPAM require unsubscribe links to remain valid long-term
const DOMAIN_PREFIX = 'unsubscribe'; // Separates key usage from CSRF tokens

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_HMAC_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_HMAC_SECRET environment variable is required');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret())
    .update(`${DOMAIN_PREFIX}:${payload}`)
    .digest('hex');
}

/**
 * Generates a time-limited HMAC-signed token for unsubscribe links.
 * Format: `<expiry>.<signature>` (URL-safe, no special chars).
 */
export function generateUnsubscribeToken(email: string, empresaId: string, action: 'alta' | 'baja'): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${email.toLowerCase()}:${empresaId}:${action}:${expiry}`;
  const signature = sign(payload);
  return `${expiry}.${signature}`;
}

/**
 * Verifies an unsubscribe token. Returns true only if the signature is valid
 * and the token has not expired.
 */
export function verifyUnsubscribeToken(
  token: string,
  email: string,
  empresaId: string,
  action: 'alta' | 'baja',
): boolean {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const expiry = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expiryNum = Number(expiry);
  if (!Number.isInteger(expiryNum) || expiryNum <= 0) return false;

  if (Math.floor(Date.now() / 1000) > expiryNum) return false;

  const payload = `${email.toLowerCase()}:${empresaId}:${action}:${expiry}`;
  const expectedSig = sign(payload);

  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
