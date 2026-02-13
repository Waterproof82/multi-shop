
'use server';
import { SiteHeaderClient } from './site-header-client';
import { cookies } from 'next/headers';

export default async function SiteHeaderWrapper() {
  const cookieStore = await cookies();
  // Validar solo con access_token (JWT)
  const accessToken = cookieStore.get('access_token');
  let showCart = false;
  const secretKey = process.env.ACCESS_TOKEN_SECRET;
  if (accessToken && secretKey) {
    try {
      const secret = new TextEncoder().encode(secretKey);
      // Importar jwtVerify dinámicamente para evitar problemas SSR
      const { jwtVerify } = await import('jose');
      await jwtVerify(accessToken.value, secret);
      showCart = true;
    } catch {
      showCart = false;
    }
  }
  return <SiteHeaderClient key="site-header" showCart={showCart} />;
}
