import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { loginSchema } from '@/core/application/dtos/auth.dto';
import { successResponse, validationErrorResponse, handleResult } from '@/core/infrastructure/api/helpers';
import { rateLimitLogin, rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { generateCsrfToken, signCsrfToken } from '@/lib/csrf';

export async function GET(request: NextRequest) {
  const rateLimit = await rateLimitPublic(request);
  if (rateLimit) return rateLimit;
  const token = generateCsrfToken();
  const signature = signCsrfToken(token);
  const cookieValue = `${token}:${signature}`;

  const response = NextResponse.json({ csrfToken: token });
  response.headers.set('Cache-Control', 'no-store, private');

  response.cookies.set('csrf_token', cookieValue, {
    httpOnly: false, // JS must read this to stay in sync across tabs; JWT stays httpOnly
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24h — matches JWT lifetime so it never expires mid-session
    path: '/',
  });

  return response;
}

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitLogin(request);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await authAdminUseCase.login(parsed.data);
  
  if (!result.success) {
    if (result.error.code === 'AUTH_LOGIN_ERROR' ||
        result.error.code === 'ADMIN_NOT_AUTHORIZED' ||
        result.error.code === 'AUTH_NO_USER') {
      // Generic message for all auth failures to prevent user enumeration
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }
    return handleResult(result);
  }

  const { token, admin } = result.data;

  const csrfToken = generateCsrfToken();
  const csrfSignature = signCsrfToken(csrfToken);
  const csrfCookieValue = `${csrfToken}:${csrfSignature}`;

  const response = successResponse({
    success: true,
    csrfToken,
    admin: {
      id: admin.id,
      nombre: admin.nombreCompleto,
      empresa: admin.empresa?.nombre ?? 'Super Admin',
      rol: admin.rol,
    },
  });

  response.cookies.set('superadmin_empresa_id', '', { maxAge: 0, path: '/' });
  response.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24,
    path: '/',
  });
  response.cookies.set('csrf_token', csrfCookieValue, {
    httpOnly: false, // JS must read this to stay in sync across tabs; JWT stays httpOnly
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24h — matches JWT lifetime
    path: '/',
  });

  return response;
}
