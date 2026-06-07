import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

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
 * Format: `<expiry>.<nonce16>.<signature>` — nonce allows multiple unique tokens
 * per (email, item, promo) so one subscriber can claim multiple coupons.
 *
 * Legacy format (no nonce): `<expiry>.<signature>` — still accepted by verifyReservaToken.
 */
export function generateReservaToken(email: string, itemId: string, tgtgPromoId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const nonce = randomBytes(8).toString('hex'); // 16 hex chars
  const payload = `${email.toLowerCase()}:${itemId}:${tgtgPromoId}:${expiry}:${nonce}`;
  const signature = sign(payload);
  return `${expiry}.${nonce}.${signature}`;
}

/**
 * Verifies a reservation token. Returns true only if HMAC is valid and not expired.
 * Accepts both legacy format (expiry.signature) and current format (expiry.nonce.signature).
 */
export function verifyReservaToken(
  token: string,
  email: string,
  itemId: string,
  tgtgPromoId: string,
): boolean {
  const firstDot = token.indexOf('.');
  if (firstDot === -1) return false;

  const expiry = token.slice(0, firstDot);
  const rest = token.slice(firstDot + 1);

  const expiryNum = Number(expiry);
  if (!Number.isInteger(expiryNum) || expiryNum <= 0) return false;

  if (Math.floor(Date.now() / 1000) > expiryNum) return false;

  const secondDot = rest.indexOf('.');

  let payload: string;
  let signature: string;

  if (secondDot === -1) {
    // Legacy format: expiry.signature
    payload = `${email.toLowerCase()}:${itemId}:${tgtgPromoId}:${expiry}`;
    signature = rest;
  } else {
    // Current format: expiry.nonce.signature
    const nonce = rest.slice(0, secondDot);
    signature = rest.slice(secondDot + 1);
    payload = `${email.toLowerCase()}:${itemId}:${tgtgPromoId}:${expiry}:${nonce}`;
  }

  const expectedSig = sign(payload);

  try {
    return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
