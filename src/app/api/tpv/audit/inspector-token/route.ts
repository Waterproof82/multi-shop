import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { signInspectorToken } from '@/lib/inspector-token';

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 401 });

  const adminId = req.headers.get('x-admin-id') ?? 'admin';

  const token = await signInspectorToken({ empresaId, emitidoPor: adminId });

  return NextResponse.json({
    token,
    inspector_url: '/tpv/audit/inspector',
    expires_in: '24h',
    instructions: 'Entregue el token al inspector. Deberá acceder a /tpv/audit/inspector y pegarlo en el formulario para descargar los registros de cobros.',
  });
}
