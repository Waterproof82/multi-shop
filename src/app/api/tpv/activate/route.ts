import { NextRequest, NextResponse } from 'next/server';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { loginSchema } from '@/core/application/dtos/auth.dto';
import { validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitLogin } from '@/core/infrastructure/api/rate-limit';

/**
 * POST /api/tpv/activate
 * Valida credenciales de admin para la pantalla de configuración del TPV Electron.
 * No setea cookies — solo confirma que el dominio y las credenciales son válidos.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const result = await getAuthAdminUseCase().login(parsed.data);

  if (!result.success) {
    return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
  }

  const { admin } = result.data;

  return NextResponse.json({
    success: true,
    empresa: admin.empresa?.nombre ?? null,
  });
}
