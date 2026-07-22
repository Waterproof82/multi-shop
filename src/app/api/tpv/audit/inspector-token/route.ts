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

  const exportUrl = `/api/tpv/audit/export?inspector_token=${token}`;

  return NextResponse.json({
    token,
    export_url: exportUrl,
    expires_in: '24h',
    instructions: 'Comparta la export_url con el inspector. El enlace expira en 24 horas y permite descargar los registros de cobros en formato JSON.',
  });
}
