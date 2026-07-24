import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET() {
  const headersList = await headers();
  const rol = headersList.get('x-admin-rol');
  const empleadoId = headersList.get('x-employee-id');
  const nombre = headersList.get('x-employee-nombre');

  if (!rol) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ rol, isEmployeeSession: !!empleadoId, empleadoId: empleadoId ?? null, nombre: nombre ?? null });
}
