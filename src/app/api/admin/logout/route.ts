import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { revokeToken } from '@/lib/token-revocation';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = request.cookies.get('admin_token')?.value;

  // Revoke the JWT by storing its jti in Redis until the token expires
  if (token) {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (secret) {
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
  }

  cookieStore.delete('admin_token');
  return NextResponse.json({ success: true });
}
