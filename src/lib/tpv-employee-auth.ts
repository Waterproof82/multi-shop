import { SignJWT, jwtVerify } from 'jose';

export interface TpvEmployeeTokenPayload {
  empleadoId: string;
  empresaId: string;
  nombre: string;
  rol: 'cajero' | 'encargado';
}

export interface TpvEmployeeTokenVerified extends TpvEmployeeTokenPayload {
  exp: number;
}

const AUDIENCE = 'tpv-employee';
const EXPIRY = '1h';

function getSecret(): Uint8Array {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

export async function signTpvEmployeeToken(payload: TpvEmployeeTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyTpvEmployeeToken(token: string): Promise<TpvEmployeeTokenVerified | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCE });
    const { empleadoId, empresaId, nombre, rol, exp } = payload as Record<string, unknown>;
    if (
      typeof empleadoId !== 'string' ||
      typeof empresaId !== 'string' ||
      typeof nombre !== 'string' ||
      (rol !== 'cajero' && rol !== 'encargado') ||
      typeof exp !== 'number'
    ) return null;
    return { empleadoId, empresaId, nombre, rol, exp };
  } catch {
    return null;
  }
}
