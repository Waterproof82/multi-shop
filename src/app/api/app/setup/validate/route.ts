import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { rateLimitLogin } from '@/core/infrastructure/api/rate-limit';
import { validationErrorResponse } from '@/core/infrastructure/api/helpers';

const setupSchema = z.object({
  email: z.string().email('Email inválido').max(254, 'Email demasiado largo'),
  password: z.string().min(1).max(128, 'Contraseña demasiado larga'),
});

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitLogin(request);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.errors[0].message);
  }

  const result = await getAuthAdminUseCase().login(parsed.data);

  if (!result.success) {
    if (
      result.error.code === 'AUTH_LOGIN_ERROR' ||
      result.error.code === 'ADMIN_NOT_AUTHORIZED' ||
      result.error.code === 'AUTH_NO_USER'
    ) {
      // Generic message for all auth failures to prevent user enumeration
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }

  const { admin } = result.data;

  if (!admin.empresaId) {
    return NextResponse.json({ error: 'Esta cuenta no tiene empresa asociada' }, { status: 403 });
  }

  return NextResponse.json({
    empresaId: admin.empresaId,
    empresaNombre: admin.empresa?.nombre ?? '',
  });
}
