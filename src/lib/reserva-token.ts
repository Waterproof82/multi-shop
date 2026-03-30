import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24h — coupons are daily
const DOMAIN_PREFIX = 'tgtg-reserva'; // Isolated from unsubscribe and CSRF tokens

function getSecret(): string {
  const secret = process.env.RESERVA_HMAC_SECRET;
  if (!secret) throw new Error('RESERVA_HMAC_SECRET environment variable is required');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret())
    .update(`${DOMAIN_PREFIX}:${payload}`)
    .digest('hex');
}

/**
 * Generates a 24h HMAC-signed token for TGTG coupon reservation links.
 * Format: `<expiry>.<signature>`
 */
export function generateReservaToken(email: string, itemId: string, tgtgPromoId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${email.toLowerCase()}:${itemId}:${tgtgPromoId}:${expiry}`;
  const signature = sign(payload);
  return `${expiry}.${signature}`;
}

/**
 * Verifies a reservation token. Returns true only if HMAC is valid and not expired.
 */
export function verifyReservaToken(
  token: string,
  email: string,
  itemId: string,
  tgtgPromoId: string,
): boolean {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const expiry = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expiryNum = Number(expiry);
  if (!Number.isInteger(expiryNum) || expiryNum <= 0) return false;

  if (Math.floor(Date.now() / 1000) > expiryNum) return false;

  const payload = `${email.toLowerCase()}:${itemId}:${tgtgPromoId}:${expiry}`;
  const expectedSig = sign(payload);

  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
