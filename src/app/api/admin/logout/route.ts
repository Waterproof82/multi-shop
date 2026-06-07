import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { revokeToken } from '@/lib/token-revocation';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const cookieStore = await cookies();
  const token = request.cookies.get('admin_token')?.value;

  // Revoke the JWT by storing its jti in Redis until the token expires
  if (token) {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (payload.jti && payload.exp) {
        const remainingTtl = payload.exp - Math.floor(Date.now() / 1000);
        await revokeToken(payload.jti, remainingTtl);
      }
    } catch {
      // Token already invalid — nothing to revoke
    }
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set('admin_token', '', { maxAge: 0, path: '/' });
  response.cookies.set('csrf_token', '', { maxAge: 0, path: '/' });
  response.cookies.set('superadmin_empresa_id', '', { maxAge: 0, path: '/' });

  return response;
}
