import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const WAITER_TOKEN_EXPIRY = '8h';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_HASH = 'SHA-256';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getWaiterTokenSecret(): Uint8Array {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

function getPinPepper(): string {
  const pepper = process.env.WAITER_PIN_PEPPER;
  if (!pepper) {
    throw new Error('WAITER_PIN_PEPPER is not configured');
  }
  return pepper;
}

/**
 * Derive a deterministic salt from empresaId + pepper so the salt is
 * company-specific without requiring us to store it separately.
 */
async function deriveSalt(empresaId: string): Promise<ArrayBuffer> {
  const pepper = getPinPepper();
  const rawSalt = `${pepper}:${empresaId}`;
  const encoded = new TextEncoder().encode(rawSalt);
  return crypto.subtle.digest('SHA-256', encoded);
}

// ---------------------------------------------------------------------------
// PIN hashing (PBKDF2 via Web Crypto — no new npm deps)
// ---------------------------------------------------------------------------

/**
 * Hash a PIN using PBKDF2 (SHA-256, 100,000 iterations).
 * Returns a base64url-encoded string.
 * The salt is derived deterministically from the empresaId + pepper.
 */
export async function hashPin(pin: string, empresaId: string): Promise<string> {
  const salt = await deriveSalt(empresaId);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH * 8
  );

  return Buffer.from(derivedBits).toString('base64url');
}

/**
 * Compare a plain PIN against a stored hash.
 * Returns true if they match.
 */
export async function verifyPin(pin: string, empresaId: string, storedHash: string): Promise<boolean> {
  const derived = await hashPin(pin, empresaId);
  // Constant-time compare via Buffer
  const a = Buffer.from(derived);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Waiter JWT (jose, audience: 'waiter-panel')
// ---------------------------------------------------------------------------

/**
 * Sign a short-lived waiter JWT (8 h, audience: 'waiter-panel').
 * Reuses ACCESS_TOKEN_SECRET — audience prevents token confusion with admin JWTs.
 */
export async function signWaiterToken(empresaId: string): Promise<string> {
  const secret = getWaiterTokenSecret();
  return new SignJWT({ empresaId, role: 'waiter' })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('waiter-panel')
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(WAITER_TOKEN_EXPIRY)
    .sign(secret);
}

/**
 * Verify a waiter JWT.
 * Returns the payload subset { empresaId } on success, or null on any failure.
 */
export async function verifyWaiterToken(token: string): Promise<{ empresaId: string } | null> {
  try {
    const secret = getWaiterTokenSecret();
    const { payload } = await jwtVerify(token, secret, { audience: 'waiter-panel' });

    if (!payload.empresaId || typeof payload.empresaId !== 'string') {
      return null;
    }

    return { empresaId: payload.empresaId };
  } catch {
    return null;
  }
}
