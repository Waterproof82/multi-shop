import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/application/use-cases/auth-admin.use-case';
import { loginSchema } from '@/core/application/dtos/auth.dto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
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

    return NextResponse.json({ 
      success: true, 
      admin: {
        id: admin.id,
        nombre: admin.nombreCompleto,
        empresa: admin.empresa.nombre,
      }
    });
  } catch (error) {
    console.error('[API /admin/login] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 401 }
    );
  }
}
