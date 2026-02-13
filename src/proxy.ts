import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const accessToken = url.searchParams.get('access');

  console.log('Proxy: Running for path:', request.nextUrl.pathname);

  if (accessToken) {
    // Sanitize token: remove any trailing non-token characters (like parenthesis from markdown links)
    const sanitizedToken = accessToken.replaceAll(/[^a-zA-Z0-9._-]/g, '');

    console.log('Proxy: Access token found in URL');
    console.log('Proxy: Raw token:', accessToken);
    console.log('Proxy: Sanitized token:', sanitizedToken);

    const secretKey = process.env.ACCESS_TOKEN_SECRET;

    if (!secretKey) {
        console.error('Proxy: ACCESS_TOKEN_SECRET is missing!');
        return NextResponse.next();
    }
    const secret = new TextEncoder().encode(secretKey);
    
    try {
      console.log('Proxy: Verifying token...');
      const { payload } = await jwtVerify(sanitizedToken, secret);
      console.log('Proxy: Token verified successfully', payload);
      
      // Token is valid
      url.searchParams.delete('access');
      const response = NextResponse.redirect(url);

      // Calcular duración restante del token en segundos
      let maxAge = 15 * 60; // fallback por si no hay exp
      if (payload?.exp) {
        const now = Math.floor(Date.now() / 1000);
        maxAge = Math.max(payload.exp - now, 0);
      }

      // Solo guardar access_token, NO cart_authorized
      response.cookies.set('access_token', sanitizedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge,
      });

      console.log('Proxy: Cookie access_token set, redirecting...');
      return response;
    } catch (error) {
      console.error('Proxy: Token verification failed', error);
      // Token is invalid or expired
      // Redirect to clean URL without setting the cookie
      url.searchParams.delete('access');
      return NextResponse.redirect(url);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
