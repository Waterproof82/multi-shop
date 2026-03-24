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
  
  response.cookies.set('csrf_token', cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600,
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
      return NextResponse.json({ error: result.error.message }, { status: 401 });
    }
    return handleResult(result);
  }

  const { token, admin } = result.data;

  const cookieStore = await cookies();

  cookieStore.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24,
    path: '/',
  });

  return successResponse({
    success: true,
    admin: {
      id: admin.id,
      nombre: admin.nombreCompleto,
      empresa: admin.empresa.nombre,
    },
  });
}
