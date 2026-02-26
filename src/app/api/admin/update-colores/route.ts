import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { adminRepository } from '@/core/infrastructure/database/SupabaseAdminRepository';

const ADMIN_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, new TextEncoder().encode(ADMIN_TOKEN_SECRET));
    const body = await request.json();
    const { empresaId, colores } = body;

    if (payload.empresaId !== empresaId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const success = await adminRepository.updateColores(empresaId, colores);

    if (!success) {
      return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en update-colores:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
