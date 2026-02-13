import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const accessToken = url.searchParams.get('access');

  console.log('Middleware: Running for path:', request.nextUrl.pathname);

  if (accessToken) {
    // Sanitize token: remove any trailing non-token characters (like parenthesis from markdown links)
    const sanitizedToken = accessToken.replace(/[^a-zA-Z0-9._-]/g, '');

    console.log('Middleware: Access token found in URL');
    console.log('Middleware: Raw token:', accessToken);
    console.log('Middleware: Sanitized token:', sanitizedToken);

    const secretKey = process.env.ACCESS_TOKEN_SECRET;

    if (!secretKey) {
        console.error('Middleware: ACCESS_TOKEN_SECRET is missing!');
        return NextResponse.next();
    }
    const secret = new TextEncoder().encode(secretKey);
    
    try {
      console.log('Middleware: Verifying token...');
      const { payload } = await jwtVerify(sanitizedToken, secret);
      console.log('Middleware: Token verified successfully', payload);
      
      // Token is valid
      url.searchParams.delete('access');
      const response = NextResponse.redirect(url);
      
      response.cookies.set('cart_authorized', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60, // 15 minutes
      });
      
      console.log('Middleware: Cookie set, redirecting...');
      return response;
    } catch (error) {
      console.error('Middleware: Token verification failed', error);
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
