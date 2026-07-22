import { SignJWT, jwtVerify } from 'jose';

export interface InspectorTokenPayload {
  empresaId: string;
  emitidoPor: string; // nombre del admin que lo generó
}

export interface InspectorTokenVerified extends InspectorTokenPayload {
  exp: number;
  jti: string;
}

const AUDIENCE = 'inspector-hacienda';
const EXPIRY = '24h';

function getSecret(): Uint8Array {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

export async function signInspectorToken(payload: InspectorTokenPayload): Promise<string> {
  const jti = crypto.randomUUID();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyInspectorToken(token: string): Promise<InspectorTokenVerified | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCE });
    const { empresaId, emitidoPor, exp, jti } = payload as Record<string, unknown>;
    if (
      typeof empresaId !== 'string' ||
      typeof emitidoPor !== 'string' ||
      typeof exp !== 'number' ||
      typeof jti !== 'string'
    ) return null;
    return { empresaId, emitidoPor, exp, jti };
  } catch {
    return null;
  }
}
