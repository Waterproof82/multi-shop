import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { loginSchema } from '@/core/application/dtos/auth.dto';
import { successResponse, errorResponse, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error.errors[0].message);
    }

    const { token, admin } = await authAdminUseCase.login(parsed.data);

    const cookieStore = await cookies();

    cookieStore.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
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
  } catch (error) {
    console.error('[API /admin/login] Error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Error interno del servidor', 401);
  }
}
