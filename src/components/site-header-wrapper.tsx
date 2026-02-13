
'use server';
import { SiteHeaderClient } from './site-header-client';
import { cookies } from 'next/headers';

export default async function SiteHeaderWrapper() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token');
  let showCart = false;
  let tokenExpiresAt: number | null = null;
  const secretKey = process.env.ACCESS_TOKEN_SECRET;
  if (accessToken && secretKey) {
    try {
      const secret = new TextEncoder().encode(secretKey);
      const { jwtVerify } = await import('jose');
      const { payload } = await jwtVerify(accessToken.value, secret);
      showCart = true;
      tokenExpiresAt = payload.exp ? payload.exp * 1000 : null;
    } catch {
      showCart = false;
    }
  }
  return <SiteHeaderClient key="site-header" showCart={showCart} tokenExpiresAt={tokenExpiresAt} />;
}
